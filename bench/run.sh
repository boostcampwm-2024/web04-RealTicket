#!/usr/bin/env bash
# bench/run.sh — RealTicket 벤치마크 자동화 진입 스크립트
# Usage: bash bench/run.sh <manifest.yaml> [--dry-run]
# fire-and-forget: nohup bash bench/run.sh manifests/X.yaml > bench/raw/run.log 2>&1 & disown
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------------------
# 유틸 함수
# ---------------------------------------------------------------------------

log() {
  local level="$1"; shift
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $*" >&2
}

die() { log ERROR "$@"; exit 1; }

# ---------------------------------------------------------------------------
# check_deps: 필수 외부 의존 도구 검증 (D-12)
# 누락 시 die()로 즉시 종료
# ---------------------------------------------------------------------------
check_deps() {
  local missing=()
  command -v yq  >/dev/null 2>&1 || missing+=(yq)
  command -v jq  >/dev/null 2>&1 || missing+=(jq)
  command -v curl >/dev/null 2>&1 || missing+=(curl)
  command -v java >/dev/null 2>&1 || missing+=(java)
  if [[ ${#missing[@]} -gt 0 ]]; then
    die "필수 도구 누락: ${missing[*]}. 설치 후 재실행하세요 (yq: https://github.com/mikefarah/yq, jq: apt/brew install jq)"
  fi
  log INFO "의존 도구 확인 완료: yq, jq, curl, java"
}

# ---------------------------------------------------------------------------
# parse_duration: duration string → 초 변환 (D-08)
# 지원 형식: Ns, Nm, Nh  예) 30s→30, 5m→300, 6h→21600
# ---------------------------------------------------------------------------
parse_duration() {
  local s="$1"
  if [[ "$s" =~ ^([0-9]+)s$ ]]; then echo "${BASH_REMATCH[1]}"
  elif [[ "$s" =~ ^([0-9]+)m$ ]]; then echo $(( BASH_REMATCH[1] * 60 ))
  elif [[ "$s" =~ ^([0-9]+)h$ ]]; then echo $(( BASH_REMATCH[1] * 3600 ))
  else die "Invalid duration string: '$s'. Use Ns, Nm, or Nh."
  fi
}

# ---------------------------------------------------------------------------
# generate_run_id: YYYYMMDD-HHMMSS 형식 run_id 생성 (Claude's Discretion)
# ---------------------------------------------------------------------------
generate_run_id() {
  date '+%Y%m%d-%H%M%S'
}

# ---------------------------------------------------------------------------
# 전역 변수 (환경 변수 기본값 포함)
# ---------------------------------------------------------------------------
GATLING_DIR="${GATLING_DIR:-/c/Users/kxu45/ProgramStudy/gatling-practice/realticket-gatling-simulations}"

# ADMIN 로그인 시각 추적 (maybe_refresh_sid에서 사용)
LAST_LOGIN_AT=0

# ---------------------------------------------------------------------------
# admin_login: ADMIN 자격으로 POST /auth/login → SID를 stdout으로 반환 (D-11)
# SID는 메모리(변수)에만 보관 — 파일 기록 없음 (T-04-04)
# ---------------------------------------------------------------------------
admin_login() {
  local target_url="$1"
  log INFO "ADMIN 로그인: $target_url"

  # 쿠키 파일: PID 포함 파일명으로 충돌 방지 + 즉시 rm (T-04-09)
  local cookie_file="/tmp/bench_cookies_$$.txt"
  local response
  response=$(curl -s -c "$cookie_file" \
    -X POST "${target_url}/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"${ADMIN_ID}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
    -w "\n%{http_code}")

  local http_code
  http_code=$(echo "$response" | tail -1)
  [[ "$http_code" == "200" ]] || { rm -f "$cookie_file"; die "ADMIN 로그인 실패 (HTTP $http_code)"; }

  # SID 추출: 쿠키 파일 우선, 없으면 응답 JSON 본문에서 시도
  local sid
  sid=$(grep -oP 'SID=\K[^\s;]+' "$cookie_file" 2>/dev/null || true)
  if [[ -z "$sid" ]]; then
    sid=$(echo "$response" | head -n -1 | jq -r '.data.SID // empty' 2>/dev/null || true)
  fi
  rm -f "$cookie_file"

  [[ -n "$sid" ]] || die "SID를 응답에서 추출할 수 없음 (HTTP $http_code)"
  LAST_LOGIN_AT=$(date +%s)
  echo "$sid"
}

# ---------------------------------------------------------------------------
# maybe_refresh_sid: SID TTL 1시간 → 3000s(50분)마다 재발급 (10분 마진)
# 반환값: 갱신된 SID (stdout)
# ---------------------------------------------------------------------------
maybe_refresh_sid() {
  local target_url="$1"
  local current_sid="$2"
  local now
  now=$(date +%s)
  if (( now - LAST_LOGIN_AT > 3000 )); then
    log INFO "SID TTL 50분 초과 — 재로그인"
    echo "$(admin_login "$target_url")"
  else
    echo "$current_sid"
  fi
}

# ---------------------------------------------------------------------------
# reset_slots: 이벤트 순차 × 슬롯 병렬 reset (Phase 1 D-03, RESET-ENDPOINT.md)
# 인자: manifest 경로, SID
# 반환: 0=성공, 1=실패 (호출자가 D-16 정책에 따라 처리)
# ---------------------------------------------------------------------------
reset_slots() {
  local manifest="$1"
  local sid="$2"

  local slots_count
  slots_count=$(yq '.slots | length' "$manifest")
  local -a event_ids
  mapfile -t event_ids < <(yq '.event_ids[]' "$manifest")

  for event_id in "${event_ids[@]}"; do
    log INFO "reset event_id=$event_id (슬롯 ${slots_count}개 병렬)"
    local -a pids=()

    # 슬롯 병렬 호출 (Lock #3: reset은 두 슬롯 병렬 허용)
    for (( i=0; i<slots_count; i++ )); do
      local target_url
      target_url=$(yq ".slots[$i].targetUrl" "$manifest")
      local reset_path
      reset_path=$(yq '.reset_path' "$manifest" | sed "s/{eventId}/${event_id}/g")
      (
        local http_code
        http_code=$(curl -s -o /dev/null -w "%{http_code}" \
          -X POST "${target_url}${reset_path}" \
          -H "Cookie: SID=${sid}")
        echo "$http_code" > "/tmp/bench_reset_${i}_$$.tmp"
      ) &
      pids+=($!)
    done

    # 병렬 호출 완료 대기
    for pid in "${pids[@]}"; do wait "$pid" || true; done

    # 결과 확인
    local all_ok=true
    for (( i=0; i<slots_count; i++ )); do
      local http_code
      http_code=$(cat "/tmp/bench_reset_${i}_$$.tmp" 2>/dev/null || echo "000")
      rm -f "/tmp/bench_reset_${i}_$$.tmp"
      if [[ "$http_code" != 2* ]]; then
        log WARN "reset 실패 (slot $i, event $event_id, HTTP $http_code)"
        all_ok=false
      fi
    done
    [[ "$all_ok" == true ]] || return 1
  done
  return 0
}

# ---------------------------------------------------------------------------
# get_slot_for_iter: iter 번호(1-based) → 슬롯 인덱스(0-based) alternating (D-13, Lock #3)
# iter1 → slot0, iter2 → slot1, iter3 → slot0, ...
# ---------------------------------------------------------------------------
get_slot_for_iter() {
  local iter="$1"
  local slots_count="$2"
  echo $(( (iter - 1) % slots_count ))
}

# ---------------------------------------------------------------------------
# run_gatling: 단일 슬롯에 대한 Gatling 실행 + 결과 iter_dir로 복사 (Phase 2 D-06)
# 8개 -P 키 모두 주입 (PsubscriptionType, PscenarioMode, PtargetUrl, PplanPath,
#                       PtargetEvent, PdynamicUserCount, PfixedBookingAmount, PmaxRetryInBookingConflict)
# Lock #3: 단일 슬롯만 실행, concurrent 미지원
# ---------------------------------------------------------------------------
run_gatling() {
  local manifest="$1"
  local slot_idx="$2"
  local iter_dir="$3"
  local sid="$4"

  local slot_name target_url subscription_type scenario_mode
  slot_name=$(yq ".slots[$slot_idx].name" "$manifest")
  target_url=$(yq ".slots[$slot_idx].targetUrl" "$manifest")
  subscription_type=$(yq '.subscription_type // "SSE"' "$manifest")
  scenario_mode=$(yq '.scenario_mode // "DYNAMIC"' "$manifest")

  local plan_path target_event dynamic_user_count fixed_booking_amount max_retry
  plan_path=$(yq '.plan_path' "$manifest")
  target_event=$(yq '.event_ids[0]' "$manifest")
  dynamic_user_count=$(yq '.dynamic_user_count // 100' "$manifest")
  fixed_booking_amount=$(yq '.fixed_booking_amount // 4' "$manifest")
  max_retry=$(yq '.max_retry_in_booking_conflict // 100' "$manifest")

  log INFO "Gatling 실행: slot=$slot_name, targetUrl=$target_url"

  # Lock #3: 단일 슬롯만 실행 (concurrent 미지원)
  (
    cd "$GATLING_DIR"
    ./gradlew gatlingRun \
      -PsubscriptionType="${subscription_type}" \
      -PscenarioMode="${scenario_mode}" \
      -PtargetUrl="${target_url}" \
      -PplanPath="${plan_path}" \
      -PtargetEvent="${target_event}" \
      -PdynamicUserCount="${dynamic_user_count}" \
      -PfixedBookingAmount="${fixed_booking_amount}" \
      -PmaxRetryInBookingConflict="${max_retry}"
  )
  local gatling_exit=$?

  # Gatling archive 결과를 iter_dir로 복사 (D-21 결과 경로 구조)
  local archive_dir="${GATLING_DIR}/archive/reports"
  local latest_results
  latest_results=$(ls -td "${archive_dir}"/results_* 2>/dev/null | head -1 || true)
  if [[ -n "$latest_results" && -d "$latest_results" ]]; then
    cp -r "$latest_results" "${iter_dir}/"
    log INFO "Gatling 결과 복사: $latest_results → $iter_dir"
    # effective-config.json 복사 (Phase 2 D-12)
    local eff_cfg="${latest_results}/effective-config.json"
    [[ -f "$eff_cfg" ]] && cp "$eff_cfg" "${iter_dir}/effective-config.json"
  else
    log WARN "Gatling 결과 폴더를 찾을 수 없음: $archive_dir/results_*"
  fi

  return $gatling_exit
}

# ---------------------------------------------------------------------------
# collect_prometheus: Prometheus range query + 결과 prom_<ts>.json 저장 (D-05)
# 실패는 결치("-") 처리 — iter 실패로 간주하지 않음 (D-16)
# ---------------------------------------------------------------------------
collect_prometheus() {
  local manifest="$1"
  local iter_dir="$2"
  local start_ts="$3"   # Unix timestamp (정수)
  local end_ts="$4"     # Unix timestamp (정수)

  local prom_url prom_step
  prom_url=$(yq '.prom_url' "$manifest")
  prom_step=$(yq '.prom_step' "$manifest")

  local ts
  ts=$(date '+%Y%m%d%H%M%S')
  local out_file="${iter_dir}/prom_${ts}.json"

  local queries_json="{}"
  local query_count
  query_count=$(yq '.queries | length' "$manifest")

  for (( qi=0; qi<query_count; qi++ )); do
    local qname promql
    qname=$(yq ".queries[$qi].name" "$manifest")
    promql=$(yq ".queries[$qi].promql" "$manifest")

    local result
    result=$(curl -sG "${prom_url}/api/v1/query_range" \
      --data-urlencode "query=${promql}" \
      --data-urlencode "start=${start_ts}" \
      --data-urlencode "end=${end_ts}" \
      --data-urlencode "step=${prom_step}" 2>/dev/null || echo '{"status":"error"}')

    local status
    status=$(echo "$result" | jq -r '.status // "error"' 2>/dev/null || echo "error")
    if [[ "$status" != "success" ]]; then
      # D-16: Prometheus 실패 → 결치 처리, iter 계속 진행
      log WARN "Prometheus 쿼리 실패 (query=$qname) — 결치 처리 (D-16)"
      queries_json=$(echo "$queries_json" | jq --arg k "$qname" '. + {($k): "-"}')
    else
      queries_json=$(echo "$queries_json" | jq --arg k "$qname" --argjson v "$result" '. + {($k): $v}')
    fi
  done

  # atomic write: 임시 파일 → mv (progress.json 패턴과 동일)
  local tmp_file="${out_file}.tmp"
  echo "$queries_json" | jq '.' > "$tmp_file"
  mv "$tmp_file" "$out_file"
  log INFO "Prometheus 결과 저장: $out_file"
}

# ---------------------------------------------------------------------------
# --- main ---
# Plan 03에서 반복 루프가 추가될 예정 — 여기서는 Usage 메시지만 출력
# ---------------------------------------------------------------------------
if [[ "${1:-}" == "" ]]; then
  echo "Usage: bash bench/run.sh <manifest.yaml> [--dry-run]"
  exit 0
fi
