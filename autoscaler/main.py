import docker
import http.client
import json as _json
import logging
import math
import os
import socket
import time
import pymysql
from prometheus_api_client import PrometheusConnect

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s"
)
logger = logging.getLogger(__name__)

PROMETHEUS_URL       = os.getenv("PROMETHEUS_URL", "http://prometheus:9090")
POLL_INTERVAL        = int(os.getenv("POLL_INTERVAL", "30"))
SCALE_UP_THRESHOLD   = float(os.getenv("SCALE_UP_THRESHOLD", "50"))
SCALE_DOWN_THRESHOLD = float(os.getenv("SCALE_DOWN_THRESHOLD", "30"))
COOLDOWN_UP          = int(os.getenv("COOLDOWN_UP", "120"))
COOLDOWN_DOWN        = int(os.getenv("COOLDOWN_DOWN", "300"))
MIN_REPLICAS         = int(os.getenv("MIN_REPLICAS", "1"))
MAX_REPLICAS         = int(os.getenv("MAX_REPLICAS", "4"))
TARGET_SERVICE       = os.getenv("TARGET_SERVICE", "realticket_nest")
DRY_RUN              = os.getenv("DRY_RUN", "true").lower() == "true"
SCALE_UP_STEP        = int(os.getenv("SCALE_UP_STEP", "2"))
SCALE_DOWN_STEP      = int(os.getenv("SCALE_DOWN_STEP", "1"))

# DB 연결 (사전 스케일업용)
DB_HOST              = os.getenv("DB_HOST", "mysql")
DB_PORT              = int(os.getenv("DB_PORT", "3306"))
DB_USER              = os.getenv("DB_USER", "root")
DB_PASSWORD          = os.getenv("DB_PASSWORD", "root1234")
DB_NAME              = os.getenv("DB_NAME", "real_ticket")
DB_POLL_INTERVAL     = int(os.getenv("DB_POLL_INTERVAL", "3600"))
PRE_SCALE_UP_WINDOW  = int(os.getenv("PRE_SCALE_UP_WINDOW", "600"))
SCALE_DOWN_SUPPRESS  = int(os.getenv("SCALE_DOWN_SUPPRESS", "300"))

QUERY = (
    f'avg(rate(container_cpu_usage_seconds_total'
    f'{{container_label_com_docker_swarm_service_name="{TARGET_SERVICE}"}}[1m]))'
)

DOCKER_SOCK = '/var/run/docker.sock'

prom = PrometheusConnect(url=PROMETHEUS_URL, disable_ssl=True)
docker_client = docker.from_env()


def _docker_raw(method: str, path: str, body: dict | None = None) -> dict:
    """Docker Unix socket 직접 호출 — SDK 직렬화 우회.

    SDK의 update_service()는 내부적으로 스펙을 Python 객체로 변환하며
    insert_defaults=True로 inspect해 기존 태스크에 없던 필드를 삽입한다.
    Docker가 이를 스펙 변경으로 감지해 기존 태스크를 rolling update로 교체하므로,
    raw HTTP로 스펙을 있는 그대로 replica count만 패치해서 돌려보낸다.
    """
    class _Conn(http.client.HTTPConnection):
        def connect(self):
            self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            self.sock.connect(DOCKER_SOCK)

    conn = _Conn('localhost')
    payload = None
    headers = {}
    if body is not None:
        payload = _json.dumps(body).encode()
        headers['Content-Type'] = 'application/json'
    conn.request(method, path, body=payload, headers=headers)
    resp = conn.getresponse()
    data = _json.loads(resp.read() or b'{}')
    conn.close()
    if resp.status not in (200, 201, 202):
        raise RuntimeError(f"Docker {method} {path} → {resp.status}: {data}")
    return data

last_scale_up   = 0.0
last_scale_down = 0.0
last_db_poll            = time.time()  # 시작 시 즉시 폴링 방지 — DB_POLL_INTERVAL 후 첫 조회
suppress_scaledown_until = 0.0


def get_cpu_percent() -> float | None:
    """Prometheus에서 CPU 사용률(%) 반환. 실패 시 None."""
    try:
        result = prom.custom_query(query=QUERY)
        if not result:
            logger.warning("Prometheus 쿼리 결과 없음")
            return None
        raw = float(result[0]["value"][1])
        if math.isnan(raw):
            logger.warning("Prometheus 쿼리 결과 NaN")
            return None
        return raw * 100
    except Exception as e:
        logger.error(f"Prometheus 쿼리 실패: {e}")
        return None


def get_current_replicas(service) -> int:
    """현재 레플리카 수 반환."""
    return service.attrs["Spec"]["Mode"]["Replicated"]["Replicas"]


def fetch_upcoming_reservation_opens() -> list[float]:
    """
    MySQL Event 테이블에서 현재 UTC 시각부터 PRE_SCALE_UP_WINDOW 초 이내에
    오픈 예정인 미래 예매의 POSIX timestamp 리스트를 반환한다.

    - 이미 지난 예매는 제외 (AUTOSCALER-09: '미래 예매만')
    - 실패 시 빈 리스트 반환 + 에러 로그
    """
    conn = None
    try:
        conn = pymysql.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            connect_timeout=5,
            charset="utf8mb4",
        )
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT UNIX_TIMESTAMP(reservation_open_date)
                FROM Event
                WHERE reservation_open_date > UTC_TIMESTAMP()
                  AND reservation_open_date <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL %s SECOND)
                """,
                (PRE_SCALE_UP_WINDOW,),
            )
            rows = cur.fetchall()
            return [float(row[0]) for row in rows if row[0] is not None]
    except Exception as e:
        logger.error(f"DB 조회 실패: {e}")
        return []
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def check_upcoming_reservations():
    """
    미래 예매 중 PRE_SCALE_UP_WINDOW 초 이내 오픈 예정 건이 있으면
    nest 서비스를 MAX_REPLICAS로 사전 스케일업하고
    suppress_scaledown_until = 오픈 시각 + SCALE_DOWN_SUPPRESS 로 설정한다.

    - 이미 MAX_REPLICAS에 도달한 경우: 스케일업 skip, suppress만 갱신
    - 여러 건 탐지 시: 가장 이른 오픈 시각 + SCALE_DOWN_SUPPRESS 와 기존 suppress 중 max 사용
    """
    global suppress_scaledown_until

    opens = fetch_upcoming_reservation_opens()
    if not opens:
        return

    earliest_open = min(opens)
    logger.info(
        f"사전 스케일업 트리거: 오픈 예정 {len(opens)}건, 최단 {earliest_open - time.time():.0f}s 후"
    )

    # suppress 갱신: 가장 이른 오픈 시각 + SCALE_DOWN_SUPPRESS (기존값보다 크면 덮어쓰기)
    new_suppress_until = earliest_open + SCALE_DOWN_SUPPRESS
    if new_suppress_until > suppress_scaledown_until:
        suppress_scaledown_until = new_suppress_until
        logger.info(
            f"스케일다운 억제 갱신: suppress_scaledown_until={suppress_scaledown_until:.0f} "
            f"(현재로부터 {suppress_scaledown_until - time.time():.0f}s 후까지)"
        )

    # 현재 레플리카 확인 + 스케일업
    try:
        service = docker_client.services.get(TARGET_SERVICE)
        service.reload()
        current = get_current_replicas(service)
    except Exception as e:
        logger.error(f"사전 스케일업: 현재 레플리카 조회 실패: {e}")
        return

    if current < MAX_REPLICAS:
        # D-16: 현재 레플리카 수 < MAX일 때만 스케일업 실행
        scale_service(MAX_REPLICAS, current, "up")
        logger.info(f"사전 스케일업 완료: {current} -> {MAX_REPLICAS}")
    else:
        logger.info(f"사전 스케일업 skip (이미 MAX={MAX_REPLICAS}) — suppress만 갱신")


def scale_service(target: int, current: int, direction: str):
    global last_scale_up, last_scale_down
    if DRY_RUN:
        logger.info(f"[DRY_RUN] would scale {TARGET_SERVICE}: {current} -> {target}")
        return
    svc = _docker_raw('GET', f'/v1.41/services/{TARGET_SERVICE}')
    spec = svc['Spec']
    spec['Mode']['Replicated']['Replicas'] = target
    _docker_raw('POST', f'/v1.41/services/{svc["ID"]}/update?version={svc["Version"]["Index"]}', spec)
    if direction == "up":
        last_scale_up = time.time()
    else:
        last_scale_down = time.time()
    logger.info(f"Scaled {TARGET_SERVICE}: {current} -> {target}")


def check_and_scale():
    cpu = get_cpu_percent()
    if cpu is None:
        return

    service = docker_client.services.get(TARGET_SERVICE)
    service.reload()
    current = get_current_replicas(service)
    logger.info(f"CPU={cpu:.1f}%, replicas={current}")

    now = time.time()

    if cpu >= SCALE_UP_THRESHOLD:
        if now - last_scale_up < COOLDOWN_UP:
            logger.debug(f"스케일업 쿨다운 중 ({now - last_scale_up:.0f}s / {COOLDOWN_UP}s)")
            return
        target = min(current + SCALE_UP_STEP, MAX_REPLICAS)
        if target > current:
            scale_service(target, current, "up")

    elif cpu <= SCALE_DOWN_THRESHOLD:
        if now < suppress_scaledown_until:
            logger.info(
                f"스케일다운 억제 중 (suppress까지 {suppress_scaledown_until - now:.0f}s 남음)"
            )
            return
        if now - last_scale_down < COOLDOWN_DOWN:
            logger.debug(f"스케일다운 쿨다운 중 ({now - last_scale_down:.0f}s / {COOLDOWN_DOWN}s)")
            return
        target = max(current - SCALE_DOWN_STEP, MIN_REPLICAS)
        if target < current:
            scale_service(target, current, "down")


if __name__ == "__main__":
    logger.info(
        f"오토스케일러 시작 (DRY_RUN={DRY_RUN}, "
        f"DB_POLL_INTERVAL={DB_POLL_INTERVAL}s, "
        f"PRE_SCALE_UP_WINDOW={PRE_SCALE_UP_WINDOW}s, "
        f"SCALE_DOWN_SUPPRESS={SCALE_DOWN_SUPPRESS}s)"
    )
    while True:
        try:
            check_and_scale()
        except Exception as e:
            logger.error(f"폴링 루프 오류 (check_and_scale): {e}")

        # D-11: DB 조회는 별도 주기 (기본 60분)
        try:
            if time.time() - last_db_poll >= DB_POLL_INTERVAL:
                last_db_poll = time.time()
                check_upcoming_reservations()
        except Exception as e:
            logger.error(f"폴링 루프 오류 (check_upcoming_reservations): {e}")

        time.sleep(POLL_INTERVAL)
