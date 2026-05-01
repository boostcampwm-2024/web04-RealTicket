#!/usr/bin/env bash
# bench/run.sh — RealTicket 벤치마크 자동화 진입 스크립트
#
# Usage:
#   bash bench/run.sh <manifest.yaml>              # 전경 실행
#   bash bench/run.sh <manifest.yaml> --dry-run    # 실행 계획만 출력
#
# fire-and-forget (BG-01, Lock #5):
#   nohup bash bench/run.sh bench/manifests/X.yaml > bench/raw/X-run.log 2>&1 & disown
#   → 터미널/Claude conversation 종료 후에도 프로세스 지속
#
# 결과 확인 (BG-03 schedule 가이드):
#   ssh VM_ubuntu 'cat bench/raw/<manifest_id>-<run_id>/progress.json'
#   ssh VM_ubuntu 'cat bench/raw/<manifest_id>-<run_id>/COMPLETED'
#   → Claude에게: "/schedule remind me at <eta> to check bench results"
#      → Claude가 자동으로 ssh → progress.json → SUMMARY.md fetch 후 알림
#
# 환경 변수:
#   ADMIN_ID, ADMIN_PASSWORD  — bench/.env 파일에서 로드 (gitignore 대상)
#   GATLING_DIR               — Gatling 프로젝트 경로 (default: 아래 참조)
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
# manifest_yq: YAML multi-document 파일의 첫 번째 manifest document만 조회
# schema.yaml은 예시 manifest를 2개 포함하므로 direct yq 조회 시 값이 합쳐진다.
# ---------------------------------------------------------------------------
manifest_yq() {
  local manifest="$1"
  local expr="$2"
  yq "select(document_index == 0) | ${expr}" "$manifest"
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
    -X POST "${target_url}/user/login" \
    -H "Content-Type: application/json" \
    -d "{\"loginId\":\"${ADMIN_ID}\",\"loginPassword\":\"${ADMIN_PASSWORD}\"}" \
    -w "\n%{http_code}")

  local http_code
  http_code=$(echo "$response" | tail -1)
  [[ "$http_code" == "200" || "$http_code" == "201" ]] || { rm -f "$cookie_file"; die "ADMIN 로그인 실패 (HTTP $http_code)"; }

  # SID 추출: 쿠키 파일 우선, 없으면 응답 JSON 본문에서 시도
  # curl -c 쿠키 파일 형식: <#HttpOnly_>host\tFALSE\t/\tFALSE\t0\tSID\t<value>
  # grep -P 는 Windows curl 환경에서 UTF-8 locale 오류 발생 → awk 단독으로 처리
  local sid
  sid=$(awk '/[[:space:]]SID[[:space:]]/{print $NF}' "$cookie_file" 2>/dev/null || true)
  if [[ -z "$sid" ]]; then
    sid=$(echo "$response" | head -n -1 | jq -r '.data.SID // empty' 2>/dev/null || true)
  fi
  rm -f "$cookie_file"

  [[ -n "$sid" ]] || die "SID를 응답에서 추출할 수 없음 (HTTP $http_code)"
  LAST_LOGIN_AT=$(date +%s)
  echo "$sid"
}

# ---------------------------------------------------------------------------
# admin_login_precheck: 매니페스트 시작 전 VM 인프라 연결성 검증 (D-13, 06-07)
# 첫 슬롯 targetUrl에 단발성 POST /user/login 호출 → HTTP 200/201이면 통과
# 쿠키·SID는 폐기 (검증 전용 — 실제 로그인은 admin_login()이 수행)
# 반환: 0=통과, 1=실패 (호출자가 FAILED 마커 발급 + exit 2)
# --dry-run에서는 호출되지 않음 (main flow가 dry-run 분기에서 조기 exit)
# ---------------------------------------------------------------------------
admin_login_precheck() {
  local manifest="$1"
  local target_url
  target_url=$(manifest_yq "$manifest" '.slots[0].targetUrl')
  [[ -n "$target_url" ]] || { log ERROR "admin_login_precheck: slots[0].targetUrl 추출 실패"; return 1; }

  log INFO "admin_login_precheck: ${target_url}/user/login 연결성 검증 (D-13)"
  local http_code
  http_code=$(curl -s -o /dev/null -w '%{http_code}' \
    --max-time 10 \
    -X POST "${target_url}/user/login" \
    -H "Content-Type: application/json" \
    -d "{\"loginId\":\"${ADMIN_ID}\",\"loginPassword\":\"${ADMIN_PASSWORD}\"}" 2>/dev/null) || http_code="000"

  if [[ "$http_code" != "200" && "$http_code" != "201" ]]; then
    log ERROR "admin_login_precheck 실패: HTTP $http_code (target: $target_url) — VM stack 재시작 필요 (D-13)"
    return 1
  fi
  log INFO "admin_login_precheck 통과: HTTP $http_code"
  return 0
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
# 인자: manifest 경로
# 반환: 0=성공, 1=실패 (호출자가 D-16 정책에 따라 처리)
# 각 슬롯마다 별도 ADMIN 로그인: dual 스택은 서버별 세션이 독립적이므로
# 슬롯 0(8080)의 SID를 슬롯 1(8081)에서 재사용하면 403 발생
# ---------------------------------------------------------------------------
reset_slots() {
  local manifest="$1"

  local slots_count
  slots_count=$(manifest_yq "$manifest" '.slots | length')
  local -a event_ids
  mapfile -t event_ids < <(manifest_yq "$manifest" '.event_ids[]')

  for event_id in "${event_ids[@]}"; do
    log INFO "reset event_id=$event_id (슬롯 ${slots_count}개 병렬)"
    local -a pids=()

    # 슬롯 병렬 호출 (Lock #3: reset은 두 슬롯 병렬 허용)
    for (( i=0; i<slots_count; i++ )); do
      local target_url
      target_url=$(manifest_yq "$manifest" ".slots[$i].targetUrl")
      # reset_path: RESET-ENDPOINT.md 패턴 — /booking/init/{eventId} (Phase 1 D-06)
      local reset_path
      local raw_reset_path
      raw_reset_path=$(manifest_yq "$manifest" '.reset_path // "/booking/init/{eventId}"')
      reset_path=$(echo "$raw_reset_path" | sed "s/{eventId}/${event_id}/g")
      (
        # 슬롯별 ADMIN 로그인 — 서버별 세션이 독립적이므로 각각 발급
        local slot_cookie="/tmp/bench_reset_cookie_${i}_$$.txt"
        curl -s -c "$slot_cookie" -o /dev/null \
          -X POST "${target_url}/user/login" \
          -H "Content-Type: application/json" \
          -d "{\"loginId\":\"${ADMIN_ID}\",\"loginPassword\":\"${ADMIN_PASSWORD}\"}"
        local slot_sid
        slot_sid=$(awk '/[[:space:]]SID[[:space:]]/{print $NF}' "$slot_cookie" 2>/dev/null || true)
        rm -f "$slot_cookie"
        local http_code
        http_code=$(curl -s -o /dev/null -w "%{http_code}" \
          -X POST "${target_url}${reset_path}" \
          -H "Cookie: SID=${slot_sid}")
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
  slot_name=$(manifest_yq "$manifest" ".slots[$slot_idx].name")
  target_url=$(manifest_yq "$manifest" ".slots[$slot_idx].targetUrl")
  subscription_type=$(manifest_yq "$manifest" '.subscription_type // "SSE"')
  scenario_mode=$(manifest_yq "$manifest" '.scenario_mode // "DYNAMIC"')

  local plan_path target_event dynamic_user_count fixed_booking_amount max_retry
  plan_path=$(manifest_yq "$manifest" '.plan_path')
  target_event=$(manifest_yq "$manifest" '.event_ids[0]')
  dynamic_user_count=$(manifest_yq "$manifest" '.dynamic_user_count // 100')
  fixed_booking_amount=$(manifest_yq "$manifest" '.fixed_booking_amount // 4')
  max_retry=$(manifest_yq "$manifest" '.max_retry_in_booking_conflict // 100')

  # Config.java가 "http://" + ROOT_URL로 URL을 조합하므로 scheme 제거 후 전달
  local target_url_noscheme="${target_url#http://}"
  target_url_noscheme="${target_url_noscheme#https://}"

  log INFO "Gatling 실행: slot=$slot_name, targetUrl=$target_url (Gatling에는 scheme 제외: $target_url_noscheme)"

  # Lock #3: 단일 슬롯만 실행 (concurrent 미지원)
  (
    cd "$GATLING_DIR"
    ./gradlew gatlingRun \
      -PsubscriptionType="${subscription_type}" \
      -PscenarioMode="${scenario_mode}" \
      -PtargetUrl="${target_url_noscheme}" \
      -PplanPath="${plan_path}" \
      -PtargetEvent="${target_event}" \
      -PdynamicUserCount="${dynamic_user_count}" \
      -PfixedBookingAmount="${fixed_booking_amount}" \
      -PmaxRetryInBookingConflict="${max_retry}"
  )
  local gatling_exit=$?

  # 이번 실행의 Gatling 결과를 iter_dir로 복사 (D-21 결과 경로 구조)
  # app/build/reports/gatling/ 에서 가장 최근 폴더 = 방금 실행한 결과 (archive/ 는 mtime 오염으로 사용 금지)
  local build_reports_dir="${GATLING_DIR}/app/build/reports/gatling"
  local latest_results
  latest_results=$(ls -td "${build_reports_dir}"/bookingsimulation-* 2>/dev/null | head -1 || true)
  if [[ -n "$latest_results" && -d "$latest_results" ]]; then
    local result_dirname
    result_dirname=$(basename "$latest_results")
    cp -r "$latest_results" "${iter_dir}/${result_dirname}"
    log INFO "Gatling 결과 복사: $latest_results → $iter_dir/$result_dirname"
    # effective-config.json 복사 (Phase 2 D-12)
    local eff_cfg="${latest_results}/effective-config.json"
    [[ -f "$eff_cfg" ]] && cp "$eff_cfg" "${iter_dir}/effective-config.json"
  else
    log WARN "Gatling 결과 폴더를 찾을 수 없음: $build_reports_dir/bookingsimulation-*"
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
  prom_url=$(manifest_yq "$manifest" '.prom_url')
  prom_step=$(manifest_yq "$manifest" '.prom_step')

  local ts
  ts=$(date '+%Y%m%d%H%M%S')
  local out_file="${iter_dir}/prom_${ts}.json"

  local queries_json="{}"
  local query_count
  query_count=$(manifest_yq "$manifest" '.queries | length')

  for (( qi=0; qi<query_count; qi++ )); do
    local qname promql
    qname=$(manifest_yq "$manifest" ".queries[$qi].name")
    promql=$(manifest_yq "$manifest" ".queries[$qi].promql")

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
# write_progress: progress.json atomic write (D-19 6개 필드, D-20 갱신 시점)
# Args: run_dir, current_iter, total_iter, phase, slot, failed_iters,
#       run_start_ts, per_run_s, cooldown_s
# ---------------------------------------------------------------------------
write_progress() {
  local run_dir="$1"
  local current_iter="$2"
  local total_iter="$3"
  local phase="$4"
  local slot="$5"
  local failed_iters="$6"
  local run_start_ts="$7"
  local per_run_s="$8"
  local cooldown_s="$9"

  # ETA 계산
  local remaining_iters=$(( total_iter - current_iter ))
  local eta_secs=$(( remaining_iters * (per_run_s + cooldown_s) ))
  local eta_ts=$(( $(date +%s) + eta_secs ))
  local eta_str
  eta_str=$(date -d "@$eta_ts" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || \
            date -r "$eta_ts" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || \
            echo "unknown")

  # D-19 progress.json 6개 필드
  local json
  json=$(jq -n \
    --argjson ci "$current_iter" \
    --argjson ti "$total_iter" \
    --arg eta "$eta_str" \
    --arg phase "$phase" \
    --arg slot "$slot" \
    --argjson fi "$failed_iters" \
    '{
      current_iter: $ci,
      total_iter: $ti,
      eta: $eta,
      phase: $phase,
      slot: $slot,
      failed_iters: $fi
    }')

  # atomic write: tmpfile + mv rename (T-04-10 mitigate)
  local progress_tmp="${run_dir}/progress.json.tmp.$$"
  echo "$json" > "$progress_tmp"
  mv "$progress_tmp" "${run_dir}/progress.json"
}

# ---------------------------------------------------------------------------
# write_iter_meta: iter start metadata for Phase 5 analyzers (D-10)
# Args: iter_dir, iter_start_epoch, slot, iter_num, plan_path
# ---------------------------------------------------------------------------
write_iter_meta() {
  local iter_dir="$1"
  local iter_start_epoch="$2"
  local slot="$3"
  local iter_num="$4"
  local plan_path="$5"

  local json
  json=$(jq -n \
    --argjson ise "$iter_start_epoch" \
    --arg slot "$slot" \
    --argjson inum "$iter_num" \
    --arg pp "$plan_path" \
    '{
      iter_start_epoch: $ise,
      slot: $slot,
      iter_num: $inum,
      plan_path: $pp
    }')

  local meta_tmp="${iter_dir}/iter_meta.json.tmp.$$"
  echo "$json" > "$meta_tmp"
  mv "$meta_tmp" "${iter_dir}/iter_meta.json"
  log INFO "iter_meta.json 저장: ${iter_dir}/iter_meta.json"
}

# ---------------------------------------------------------------------------
# --- main ---
# ---------------------------------------------------------------------------
main() {
  local manifest="$1"
  local dry_run="${2:-}"

  [[ -f "$manifest" ]] || die "매니페스트 파일이 없음: $manifest"

  # --dry-run은 java(Gatling) 불필요 — yq/jq/curl만 확인
  if [[ "${2:-}" == "--dry-run" ]]; then
    command -v yq  >/dev/null 2>&1 || die "yq가 없습니다 (https://github.com/mikefarah/yq)"
    command -v jq  >/dev/null 2>&1 || die "jq가 없습니다"
  else
    check_deps
  fi

  # .env 로드 (dry-run은 ADMIN 불필요이므로 skip)
  local env_file="${SCRIPT_DIR}/.env"
  if [[ "${2:-}" != "--dry-run" ]]; then
    [[ -f "$env_file" ]] && source "$env_file" || \
      log WARN ".env 파일 없음 — 환경변수 ADMIN_ID, ADMIN_PASSWORD 직접 설정 필요"
    [[ -n "${ADMIN_ID:-}" ]] || die "ADMIN_ID가 설정되지 않음"
    [[ -n "${ADMIN_PASSWORD:-}" ]] || die "ADMIN_PASSWORD가 설정되지 않음"
  fi

  # 매니페스트 파싱
  local manifest_id run_id_prefix warmup per_run cooldown max_failures
  manifest_id=$(manifest_yq "$manifest" '.manifest_id')
  run_id_prefix=$(manifest_yq "$manifest" '.run_id_prefix')
  warmup=$(manifest_yq "$manifest" '.warmup')
  per_run=$(manifest_yq "$manifest" '.per_run')
  cooldown=$(manifest_yq "$manifest" '.cooldown')
  max_failures=$(manifest_yq "$manifest" '.max_failures // "3"')
  local plan_path
  plan_path=$(manifest_yq "$manifest" '.plan_path')

  local warmup_s per_run_s cooldown_s
  warmup_s=$(parse_duration "$warmup")
  per_run_s=$(parse_duration "$per_run")
  cooldown_s=$(parse_duration "$cooldown")

  # 종료 조건: iterations 또는 duration (D-14, MAN-05)
  local total_iter
  local iter_mode
  local iter_val
  iter_val=$(manifest_yq "$manifest" '.iterations // ""')
  local dur_val
  dur_val=$(manifest_yq "$manifest" '.duration // ""')

  if [[ -n "$iter_val" && -n "$dur_val" ]]; then
    die "iterations와 duration을 동시에 지정할 수 없습니다. 둘 중 하나만 사용하세요."
  elif [[ -n "$iter_val" ]]; then
    total_iter=$iter_val
    iter_mode="iterations"
  elif [[ -n "$dur_val" ]]; then
    local dur_s
    dur_s=$(parse_duration "$dur_val")
    total_iter=$(( (dur_s - warmup_s) / (per_run_s + cooldown_s) ))
    [[ $total_iter -gt 0 ]] || die "duration이 너무 짧아 iter를 1회도 실행할 수 없음"
    iter_mode="duration:${dur_val}"
    log INFO "duration 기반 N 사전 계산: total_iter=$total_iter (D-14)"
  else
    die "iterations 또는 duration 중 하나를 지정해야 합니다"
  fi

  local slots_count
  slots_count=$(manifest_yq "$manifest" '.slots | length')

  # --dry-run 모드: 실행 계획만 출력 후 종료 (D-23)
  if [[ "$dry_run" == "--dry-run" ]]; then
    echo "=== DRY-RUN 실행 계획 ==="
    echo "manifest_id: $manifest_id"
    echo "종료 조건: $iter_mode"
    echo "total_iter: $total_iter"
    echo "slots: $slots_count 개"
    local total_secs=$(( warmup_s + total_iter * (per_run_s + cooldown_s) ))
    echo "예상 총 소요: $((total_secs / 60))분"
    local eta_ts=$(( $(date +%s) + total_secs ))
    echo "예상 완료: $(date -d "@$eta_ts" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -r "$eta_ts" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || echo 'N/A')"
    echo ""
    echo "iter 순서 (alternating, D-13):"
    for (( i=1; i<=total_iter && i<=10; i++ )); do
      local sidx
      sidx=$(get_slot_for_iter "$i" "$slots_count")
      local sname
      sname=$(manifest_yq "$manifest" ".slots[$sidx].name")
      echo "  iter $i → slot: $sname (idx $sidx)"
    done
    [[ $total_iter -gt 10 ]] && echo "  ... (이후 $((total_iter-10))개 iter 생략)"
    exit 0
  fi

  # run_id 생성 (D-21)
  local run_id
  run_id=$(generate_run_id)
  local run_dir="${SCRIPT_DIR}/raw/${manifest_id}-${run_id}"
  mkdir -p "$run_dir"

  # RUNNING 마커 생성 (BG-02, D-21)
  touch "${run_dir}/RUNNING"
  echo "started_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ') manifest=$manifest_id" >> "${run_dir}/RUNNING"
  log INFO "RUNNING 마커 생성: ${run_dir}/RUNNING"

  # trap: 비정상 종료(오류, 신호) 시 FAILED 마커 생성 + RUNNING 삭제
  _trap_run_dir="$run_dir"
  cleanup_on_exit() {
    local exit_code=$?
    rm -f "${_trap_run_dir}/RUNNING"
    if [[ $exit_code -ne 0 ]]; then
      echo "exit_code=${exit_code}, stopped_at=$(date '+%Y-%m-%dT%H:%M:%SZ')" \
        >> "${_trap_run_dir}/FAILED"
      log ERROR "비정상 종료 (exit $exit_code) — FAILED 마커 생성"
    fi
  }
  trap cleanup_on_exit EXIT

  # admin login pre-check (D-13, 06-07): VM 인프라 연결성 게이트
  # 실패 시 매니페스트 진행 중단 — VM stack force-restart 후 재실행 필요
  if ! admin_login_precheck "$manifest"; then
    {
      echo "reason=admin_login_precheck_failed"
      echo "run_id=${run_id}"
      echo "manifest_id=${manifest_id}"
      echo "failed_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    } > "${run_dir}/FAILED"
    rm -f "${run_dir}/RUNNING"
    log ERROR "매니페스트 진행 중단 — D-13 VM 복구 절차로 stack 재시작 후 재실행 필요"
    trap - EXIT  # cleanup_on_exit 중복 append 방지
    exit 2
  fi

  log INFO "벤치마크 시작: manifest=$manifest_id, run_id=$run_id, total_iter=$total_iter"

  # 첫 슬롯 targetUrl로 ADMIN 로그인 (D-11)
  local first_target_url
  first_target_url=$(manifest_yq "$manifest" '.slots[0].targetUrl')
  local SID
  SID=$(admin_login "$first_target_url")
  log INFO "ADMIN SID 발급 완료"

  # warmup sleep
  log INFO "warmup: ${warmup}"
  sleep "$warmup_s"

  # 실패 카운터 (06-08 D-16 강화):
  #   global_consecutive — 어떤 슬롯이든 인접 iter 연속 실패 (인프라 전체 장애)
  #   per_slot_consecutive[i] — 같은 슬롯의 *최근 시도* 연속 실패 (해당 슬롯 단독 장애)
  #   total_failed — 매니페스트 전체 누적 실패 횟수 (COMPLETED 마커 + progress.json 보고용)
  # 둘 중 하나라도 max_failures 도달 시 매니페스트 abort.
  # 1회 실패 후 회복은 일시 장애로 tolerate (해당 카운터만 리셋).
  local global_consecutive=0
  local total_failed=0
  local -a per_slot_consecutive
  local _slot_init_idx
  for (( _slot_init_idx=0; _slot_init_idx<slots_count; _slot_init_idx++ )); do
    per_slot_consecutive[$_slot_init_idx]=0
  done
  local run_start_ts
  run_start_ts=$(date +%s)

  for (( iter=1; iter<=total_iter; iter++ )); do
    # duration 기반: 남은 시간 확인 (D-18)
    if [[ "$iter_mode" == duration:* ]]; then
      local elapsed=$(( $(date +%s) - run_start_ts + warmup_s ))
      local total_dur_s
      total_dur_s=$(parse_duration "${iter_mode#duration:}")
      local remaining=$(( total_dur_s - elapsed ))
      if (( remaining < per_run_s )); then
        log INFO "남은 시간(${remaining}s)이 per_run(${per_run_s}s)보다 짧아 조기 종료 (D-18)"
        break
      fi
    fi

    local slot_idx
    slot_idx=$(get_slot_for_iter "$iter" "$slots_count")
    local slot_name
    slot_name=$(manifest_yq "$manifest" ".slots[$slot_idx].name")
    local slot_target
    slot_target=$(manifest_yq "$manifest" ".slots[$slot_idx].targetUrl")

    local iter_dir="${run_dir}/iter-${iter}-slot-${slot_name}"
    mkdir -p "$iter_dir"

    log INFO "=== iter $iter/$total_iter → slot=$slot_name ==="

    # SID 만료 방지 (TTL=1h → 50분마다 재발급)
    SID=$(maybe_refresh_sid "$slot_target" "$SID")

    # progress.json 갱신 — phase=reset (D-20). failed_iters는 누적 total_failed (06-08).
    write_progress "$run_dir" "$iter" "$total_iter" "reset" "$slot_name" "$total_failed" "$run_start_ts" "$per_run_s" "$cooldown_s"

    # 1. reset (06-08: 실패 시 reason 캡처)
    local iter_ok=1
    local iter_fail_reason=""
    local iter_fail_detail=""
    if ! reset_slots "$manifest"; then
      log WARN "iter $iter: reset 실패"
      iter_fail_reason="reset_failed"
      iter_ok=0
    fi

    # 2. Gatling (reset 성공 시만)
    local iter_start_ts
    iter_start_ts=$(date +%s)
    # D-10: iter_meta.json 저장 (Phase 5 analyzer input)
    write_iter_meta "$iter_dir" "$iter_start_ts" "$slot_name" "$iter" "$plan_path"
    if [[ $iter_ok -eq 1 ]]; then
      write_progress "$run_dir" "$iter" "$total_iter" "gatling" "$slot_name" "$total_failed" "$run_start_ts" "$per_run_s" "$cooldown_s"
      local gatling_rc=0
      run_gatling "$manifest" "$slot_idx" "$iter_dir" "$SID" || gatling_rc=$?
      if (( gatling_rc != 0 )); then
        log WARN "iter $iter: Gatling 실패 (exit=$gatling_rc)"
        iter_fail_reason="gatling_failed"
        iter_fail_detail="gatling_exit=${gatling_rc}"
        iter_ok=0
      fi
    fi
    local iter_end_ts
    iter_end_ts=$(date +%s)

    # 3. Prometheus 수집 (iter 성공/실패 무관 — D-16)
    if [[ $iter_ok -eq 1 ]]; then
      write_progress "$run_dir" "$iter" "$total_iter" "prometheus" "$slot_name" "$total_failed" "$run_start_ts" "$per_run_s" "$cooldown_s"
      collect_prometheus "$manifest" "$iter_dir" "$iter_start_ts" "$iter_end_ts"
    fi

    # 4. 실패 처리 (D-15·D-17, 06-08 강화):
    #    - iter_dir/FAILED: 구조화 reason (reset_failed | gatling_failed)
    #    - global_consecutive 또는 per_slot_consecutive[slot] 둘 중 하나가 max_failures 도달 시 abort
    #    - 1회 실패 후 회복은 일시 장애로 tolerate (해당 카운터만 리셋)
    if [[ $iter_ok -eq 0 ]]; then
      {
        echo "reason=${iter_fail_reason:-unknown}"
        echo "slot=${slot_name}"
        echo "iter=${iter}"
        [[ -n "$iter_fail_detail" ]] && echo "$iter_fail_detail"
        echo "failed_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
      } > "${iter_dir}/FAILED"

      global_consecutive=$(( global_consecutive + 1 ))
      per_slot_consecutive[$slot_idx]=$(( ${per_slot_consecutive[$slot_idx]} + 1 ))
      total_failed=$(( total_failed + 1 ))
      log WARN "iter $iter FAILED (reason=${iter_fail_reason}, global_consec=${global_consecutive}/${max_failures}, slot=${slot_name} consec=${per_slot_consecutive[$slot_idx]}/${max_failures}, total_failed=${total_failed})"

      local trip_condition=""
      if (( global_consecutive >= max_failures )); then
        trip_condition="global_consecutive"
      elif (( ${per_slot_consecutive[$slot_idx]} >= max_failures )); then
        trip_condition="per_slot:${slot_name}"
      fi

      if [[ -n "$trip_condition" ]]; then
        log ERROR "max_failures(${max_failures}) trip — condition=${trip_condition}. 매니페스트 abort (06-08)"
        {
          echo "reason=max_failures_exceeded"
          echo "trip_condition=${trip_condition}"
          echo "max_failures=${max_failures}"
          echo "global_consecutive=${global_consecutive}"
          local _slot_dump_idx _slot_dump_name
          for (( _slot_dump_idx=0; _slot_dump_idx<slots_count; _slot_dump_idx++ )); do
            _slot_dump_name=$(manifest_yq "$manifest" ".slots[$_slot_dump_idx].name")
            echo "per_slot_consecutive_${_slot_dump_name}=${per_slot_consecutive[$_slot_dump_idx]}"
          done
          echo "total_failed=${total_failed}"
          echo "last_failed_iter=${iter}"
          echo "last_failed_slot=${slot_name}"
          echo "stopped_at=$(date '+%Y-%m-%dT%H:%M:%SZ')"
        } > "${run_dir}/FAILED"
        rm -f "${run_dir}/RUNNING"
        trap - EXIT  # cleanup_on_exit 중복 append 방지
        exit 3
      fi
    else
      # 성공 시 글로벌·해당 슬롯 연속 카운터 리셋. 다른 슬롯 카운터는 유지.
      global_consecutive=0
      per_slot_consecutive[$slot_idx]=0
    fi

    # progress.json 갱신 — phase=idle (D-20)
    write_progress "$run_dir" "$iter" "$total_iter" "idle" "$slot_name" "$total_failed" "$run_start_ts" "$per_run_s" "$cooldown_s"

    # cooldown (마지막 iter 제외)
    if (( iter < total_iter )); then
      log INFO "cooldown: ${cooldown}"
      sleep "$cooldown_s"
    fi
  done

  # D-11: summarize.py 자동 호출 (Phase 5). 실패해도 COMPLETED 마커 생성은 유지한다.
  python3 "${SCRIPT_DIR}/analyze/summarize.py" "$run_dir" \
    || log WARN "summarize 실패 — raw 데이터는 보존됨 (D-11)"

  # 정상 종료: RUNNING 삭제 + COMPLETED 마커 (BG-02, D-21).
  # 06-08: total_failed_iters는 매니페스트 전체 누적 실패 횟수.
  # 일시 장애로 tolerate된 isolated fail이 있어도 매니페스트가 완주했으면 COMPLETED 발급.
  # analyzer는 total_failed_iters > 0인 경우 해당 iter_dir/FAILED 마커를 읽어 진단 가능.
  rm -f "${run_dir}/RUNNING"
  {
    echo "completed_at=$(date '+%Y-%m-%dT%H:%M:%SZ')"
    echo "total_iter_executed=$((iter - 1))"
    echo "total_failed_iters=${total_failed}"
    echo "manifest_id=${manifest_id}"
    echo "run_id=${run_id}"
  } > "${run_dir}/COMPLETED"
  log INFO "벤치마크 완료: ${run_dir}/COMPLETED"
  # trap을 정상 종료로 처리하기 위해 재설정
  trap - EXIT
}

if [[ "${1:-}" == "" ]]; then
  echo "Usage: bash bench/run.sh <manifest.yaml> [--dry-run]"
  echo "  --dry-run  실행 계획만 출력하고 종료"
  exit 0
fi

main "$1" "${2:-}"
