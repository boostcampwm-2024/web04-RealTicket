import docker
import http.client
import json as _json
import logging
import math
import os
import redis
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
POLL_INTERVAL        = int(os.getenv("POLL_INTERVAL", "5"))
SCALE_UP_THRESHOLD   = float(os.getenv("SCALE_UP_THRESHOLD", "50"))
SCALE_DOWN_THRESHOLD = float(os.getenv("SCALE_DOWN_THRESHOLD", "30"))
COOLDOWN_UP          = int(os.getenv("COOLDOWN_UP", "120"))
COOLDOWN_DOWN        = int(os.getenv("COOLDOWN_DOWN", "300"))
COOLDOWN_DOWN_AFTER_UP = int(os.getenv("COOLDOWN_DOWN_AFTER_UP", "300"))
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

# Phase 05: 축 1 — 트래픽 기반 선행 감지 임계값 (지표별 별도 설정)
TRAFFIC_TOTAL_RATE_MULTIPLIER       = float(os.getenv("TRAFFIC_TOTAL_RATE_MULTIPLIER", "3.0"))
TRAFFIC_TOTAL_MIN_RPS               = float(os.getenv("TRAFFIC_TOTAL_MIN_RPS", "6.0"))
TRAFFIC_SERVER_TIME_RATE_MULTIPLIER = float(os.getenv("TRAFFIC_SERVER_TIME_RATE_MULTIPLIER", "2.0"))
TRAFFIC_SERVER_TIME_MIN_RPS         = float(os.getenv("TRAFFIC_SERVER_TIME_MIN_RPS", "3.0"))
TRAFFIC_CONSECUTIVE                 = int(os.getenv("TRAFFIC_CONSECUTIVE", "2"))
TRAFFIC_SUPPRESS                    = int(os.getenv("TRAFFIC_SUPPRESS", "120"))
TRAFFIC_WINDOW                      = os.getenv("TRAFFIC_WINDOW", "30s")

# Phase 05: 축 2 — ready 기반 in-booking 풀 조정 계수
POOL_PER_REPLICA         = int(os.getenv("POOL_PER_REPLICA", "100"))

# Phase 05: 축 3 — 단계화 사전 스케일업 기준값
BASE_POOL_SIZE           = int(os.getenv("BASE_POOL_SIZE", "100"))

# Redis 연결 (sessions:active 조회용)
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))

redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)

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
suppress_traffic_until   = 0.0          # Phase 05: 트래픽 기반 스케일업 후 suppress (D-12)
consecutive_traffic_alerts = 0          # Phase 05: 연속 트래픽 경보 카운터 (D-06)


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


def get_active_session_count() -> int | None:
    """sessions:active ZSET에서 만료되지 않은 세션 수를 반환한다.

    pipeline:
      1. ZREMRANGEBYSCORE sessions:active 0 {now_ms}  — 만료 항목 GC
      2. ZCOUNT sessions:active {now_ms} +inf          — 유효 세션 수

    실패 시 None 반환.
    """
    try:
        now_ms = int(time.time() * 1000)
        pipe = redis_client.pipeline()
        pipe.zremrangebyscore('sessions:active', 0, now_ms)
        pipe.zcount('sessions:active', now_ms, '+inf')
        results = pipe.execute()
        return int(results[1])
    except Exception as e:
        logger.error(f"sessions:active 조회 실패: {e}")
        return None


def check_traffic_preemptive():
    """축 1: HTTP RPS 증가율 기반 선행 감지 스케일업.

    suppress_traffic_until 활성 중이면 즉시 반환.
    PromQL 2종 중 하나라도 임계값 초과 시 consecutive_traffic_alerts += 1.
    TRAFFIC_CONSECUTIVE 회 연속 초과 시 current + SCALE_UP_STEP으로 스케일업.
    """
    global suppress_traffic_until, consecutive_traffic_alerts

    now = time.time()
    if now < suppress_traffic_until:
        logger.debug(
            f"트래픽 suppress 활성 중 ({suppress_traffic_until - now:.0f}s 남음) — 트래픽 체크 skip"
        )
        return

    window = TRAFFIC_WINDOW

    q_total_now        = f'sum(rate(http_requests_total[{window}]))'
    q_server_time_now  = f'sum(rate(http_requests_total{{path="/booking/server-time"}}[{window}]))'
    q_total_base       = f'sum(rate(http_requests_total[5m]))'
    q_server_time_base = f'sum(rate(http_requests_total{{path="/booking/server-time"}}[5m]))'

    def query_scalar(q: str) -> float | None:
        try:
            result = prom.custom_query(query=q)
            if not result:
                return None
            val = float(result[0]["value"][1])
            return None if math.isnan(val) else val
        except Exception as e:
            logger.error(f"트래픽 PromQL 쿼리 실패 ({q[:60]}...): {e}")
            return None

    total_now  = query_scalar(q_total_now)
    total_base = query_scalar(q_total_base)
    st_now     = query_scalar(q_server_time_now)
    st_base    = query_scalar(q_server_time_base)

    def exceeds(cur: float | None, base: float | None, mult: float, min_rps: float) -> bool:
        if cur is None or base is None or cur < min_rps:
            return False
        return cur >= min_rps if base < 0.1 else cur >= base * mult

    triggered = (
        exceeds(total_now, total_base, TRAFFIC_TOTAL_RATE_MULTIPLIER, TRAFFIC_TOTAL_MIN_RPS) or
        exceeds(st_now, st_base, TRAFFIC_SERVER_TIME_RATE_MULTIPLIER, TRAFFIC_SERVER_TIME_MIN_RPS)
    )

    if triggered:
        consecutive_traffic_alerts += 1
        logger.info(
            f"트래픽 선행 감지: consecutive={consecutive_traffic_alerts}/{TRAFFIC_CONSECUTIVE}, "
            f"total_rps={total_now:.2f}(base={total_base:.2f}), "
            f"server_time_rps={st_now:.2f}(base={st_base:.2f})"
        )
        if consecutive_traffic_alerts >= TRAFFIC_CONSECUTIVE:
            consecutive_traffic_alerts = 0
            try:
                service = docker_client.services.get(TARGET_SERVICE)
                service.reload()
                current = get_current_replicas(service)
                target = min(current + SCALE_UP_STEP, MAX_REPLICAS)
                new_suppress = now + TRAFFIC_SUPPRESS
                if target > current:
                    scale_service(target, current, "up")
                    suppress_traffic_until = max(suppress_traffic_until, new_suppress)
                    logger.info(f"트래픽 기반 스케일업: {current} -> {target}, suppress {TRAFFIC_SUPPRESS}s")
                else:
                    logger.info(f"트래픽 기반 스케일업 skip (이미 MAX={MAX_REPLICAS})")
                    suppress_traffic_until = max(suppress_traffic_until, new_suppress)
            except Exception as e:
                logger.error(f"트래픽 기반 스케일업 실패: {e}")
    else:
        if consecutive_traffic_alerts > 0:
            logger.debug(f"트래픽 선행 감지 미달 — 카운터 리셋 (was {consecutive_traffic_alerts})")
        consecutive_traffic_alerts = 0


def get_current_replicas(service) -> int:
    """현재 레플리카 수 반환."""
    return service.attrs["Spec"]["Mode"]["Replicated"]["Replicas"]


def get_ready_replicas() -> int | None:
    """Prometheus up{job="nest-app"}==1 기반 ready 레플리카 수 반환. 실패 시 None."""
    try:
        result = prom.custom_query(query='count(up{job="nest-app"}==1)')
        if not result:
            logger.warning("get_ready_replicas: 결과 없음 — skip")
            return None
        val = float(result[0]["value"][1])
        return None if math.isnan(val) else int(val)
    except Exception as e:
        logger.error(f"get_ready_replicas 쿼리 실패: {e}")
        return None


def update_in_booking_pool_size(new_size: int) -> None:
    """Redis in-booking:default-max-size SET + booking:events PUBLISH."""
    redis_client.set('in-booking:default-max-size', str(new_size))
    redis_client.publish('booking:events', '{"type":"all-in-booking-max-size-changed"}')
    logger.info(f"in-booking 풀 사이즈 업데이트: {new_size} (SET + PUBLISH)")


def check_and_adjust_pool():
    """축 2: min(docker desired, prometheus ready) × POOL_PER_REPLICA로 풀 동적 조정."""
    try:
        service = docker_client.services.get(TARGET_SERVICE)
        service.reload()
        desired = get_current_replicas(service)
    except Exception as e:
        logger.error(f"check_and_adjust_pool: Docker desired 조회 실패 — skip: {e}")
        return

    ready = get_ready_replicas()
    if ready is None:
        logger.debug("check_and_adjust_pool: ready=None — skip")
        return
    if ready == 0:
        logger.warning("check_and_adjust_pool: ready=0 — skip (풀 0 설정 방지)")
        return

    new_pool = min(desired, ready) * POOL_PER_REPLICA

    try:
        current_val = redis_client.get('in-booking:default-max-size')
        current_pool = int(current_val) if current_val is not None else None
    except Exception as e:
        logger.error(f"check_and_adjust_pool: Redis GET 실패 — skip: {e}")
        return

    if current_pool == new_pool:
        logger.debug(f"check_and_adjust_pool: 변화 없음 (pool={new_pool}) — skip")
        return

    logger.info(f"in-booking 풀 조정: desired={desired}, ready={ready}, {current_pool} -> {new_pool}")
    try:
        update_in_booking_pool_size(new_pool)
    except Exception as e:
        logger.error(f"check_and_adjust_pool: Redis SET+PUBLISH 실패: {e}")


def determine_pre_scale_tier(session_count: int, max_replicas: int) -> int:
    """로그인 세션 비율 기반 단계화 사전 스케일업 목표 레플리카 수.

    ratio = session_count / BASE_POOL_SIZE
    ratio < 0.15  → 0 (skip)
    < 0.40        → ceil(max * 0.5)
    < 0.80        → ceil(max * 0.75)
    >= 0.80       → max
    """
    if BASE_POOL_SIZE <= 0:
        logger.error("BASE_POOL_SIZE가 0 이하 — 단계화 불가, skip")
        return 0
    ratio = session_count / BASE_POOL_SIZE
    logger.info(f"단계화: session_count={session_count}, ratio={ratio:.3f}")
    if ratio < 0.15:
        logger.info(f"tier=SKIP (ratio={ratio:.3f})")
        return 0
    elif ratio < 0.40:
        t = math.ceil(max_replicas * 0.5)
        logger.info(f"tier=LOW → {t}")
        return t
    elif ratio < 0.80:
        t = math.ceil(max_replicas * 0.75)
        logger.info(f"tier=MID → {t}")
        return t
    else:
        logger.info(f"tier=HIGH → {max_replicas}")
        return max_replicas


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
    """축 3: 수요 기반 단계화 사전 스케일업 (AUTOSCALER-09 수정).

    target=0: skip (suppress 갱신 없음)
    target>0: current<target일 때만 scale_service + suppress_scaledown_until max() 갱신
    """
    global suppress_scaledown_until

    opens = fetch_upcoming_reservation_opens()
    if not opens:
        return

    earliest_open = min(opens)
    logger.info(f"사전 스케일업 트리거: 오픈 예정 {len(opens)}건, 최단 {earliest_open - time.time():.0f}s 후")

    session_count = get_active_session_count()
    if session_count is None:
        logger.warning("사전 스케일업: sessions:active 조회 실패 — skip")
        return

    target = determine_pre_scale_tier(session_count, MAX_REPLICAS)
    if target == 0:
        logger.info("사전 스케일업 tier=SKIP — 스케일업 및 suppress 갱신 없음")
        return

    new_suppress_until = earliest_open + SCALE_DOWN_SUPPRESS
    if new_suppress_until > suppress_scaledown_until:
        suppress_scaledown_until = new_suppress_until
        logger.info(f"스케일다운 억제 갱신: {suppress_scaledown_until - time.time():.0f}s 후까지")

    try:
        service = docker_client.services.get(TARGET_SERVICE)
        service.reload()
        current = get_current_replicas(service)
    except Exception as e:
        logger.error(f"사전 스케일업: 현재 레플리카 조회 실패: {e}")
        return

    if current < target:
        scale_service(target, current, "up")
        logger.info(f"단계화 사전 스케일업 완료: {current} -> {target}")
    else:
        logger.info(f"단계화 사전 스케일업 skip (current={current} >= target={target}) — suppress만 갱신")


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
        if now < suppress_scaledown_until or now < suppress_traffic_until:
            active = max(suppress_scaledown_until, suppress_traffic_until)
            logger.info(
                f"스케일다운 억제 중 (suppress까지 {active - now:.0f}s 남음, "
                f"scaledown={suppress_scaledown_until - now:.0f}s, "
                f"traffic={suppress_traffic_until - now:.0f}s)"
            )
            return
        if now - last_scale_up < COOLDOWN_DOWN_AFTER_UP:
            logger.debug(f"스케일업 후 스케일다운 억제 중 ({now - last_scale_up:.0f}s / {COOLDOWN_DOWN_AFTER_UP}s)")
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

        try:
            check_traffic_preemptive()
        except Exception as e:
            logger.error(f"폴링 루프 오류 (check_traffic_preemptive): {e}")

        try:
            check_and_adjust_pool()
        except Exception as e:
            logger.error(f"폴링 루프 오류 (check_and_adjust_pool): {e}")

        try:
            active_sessions = get_active_session_count()
            if active_sessions is not None:
                logger.info(f"active_session_count={active_sessions}")
        except Exception as e:
            logger.error(f"폴링 루프 오류 (get_active_session_count): {e}")

        # D-11: DB 조회는 별도 주기 (기본 60분)
        try:
            if time.time() - last_db_poll >= DB_POLL_INTERVAL:
                last_db_poll = time.time()
                check_upcoming_reservations()
        except Exception as e:
            logger.error(f"폴링 루프 오류 (check_upcoming_reservations): {e}")

        time.sleep(POLL_INTERVAL)
