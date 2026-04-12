import docker
import time
import logging
import math
import os
from prometheus_api_client import PrometheusConnect

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s"
)
logger = logging.getLogger(__name__)

PROMETHEUS_URL       = os.getenv("PROMETHEUS_URL", "http://prometheus:9090")
POLL_INTERVAL        = int(os.getenv("POLL_INTERVAL", "30"))
SCALE_UP_THRESHOLD   = float(os.getenv("SCALE_UP_THRESHOLD", "70"))
SCALE_DOWN_THRESHOLD = float(os.getenv("SCALE_DOWN_THRESHOLD", "30"))
COOLDOWN_UP          = int(os.getenv("COOLDOWN_UP", "120"))
COOLDOWN_DOWN        = int(os.getenv("COOLDOWN_DOWN", "300"))
MIN_REPLICAS         = int(os.getenv("MIN_REPLICAS", "1"))
MAX_REPLICAS         = int(os.getenv("MAX_REPLICAS", "4"))
TARGET_SERVICE       = os.getenv("TARGET_SERVICE", "realticket_nest")
DRY_RUN              = os.getenv("DRY_RUN", "true").lower() == "true"
SCALE_UP_STEP        = int(os.getenv("SCALE_UP_STEP", "2"))
SCALE_DOWN_STEP      = int(os.getenv("SCALE_DOWN_STEP", "1"))

QUERY = (
    'avg(rate(container_cpu_usage_seconds_total'
    '{container_label_com_docker_swarm_service_name="nest"}[1m]))'
)

prom = PrometheusConnect(url=PROMETHEUS_URL, disable_ssl=True)
docker_client = docker.from_env()

last_scale_up   = 0.0
last_scale_down = 0.0


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


def scale_service(target: int, current: int, direction: str):
    global last_scale_up, last_scale_down
    if DRY_RUN:
        logger.info(f"[DRY_RUN] would scale {TARGET_SERVICE}: {current} -> {target}")
        return
    service = docker_client.services.get(TARGET_SERVICE)
    service.reload()
    service.scale(target)
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
        if now - last_scale_down < COOLDOWN_DOWN:
            logger.debug(f"스케일다운 쿨다운 중 ({now - last_scale_down:.0f}s / {COOLDOWN_DOWN}s)")
            return
        target = max(current - SCALE_DOWN_STEP, MIN_REPLICAS)
        if target < current:
            scale_service(target, current, "down")


if __name__ == "__main__":
    logger.info(f"오토스케일러 시작 (DRY_RUN={DRY_RUN})")
    while True:
        try:
            check_and_scale()
        except Exception as e:
            logger.error(f"폴링 루프 오류: {e}")
        time.sleep(POLL_INTERVAL)
