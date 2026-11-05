#!/usr/bin/env bash
# run_eval.sh: run DSH and pi on 3 real scg-cash-management bug fixes, one at a time.
# Writes docs/EVAL_RESULTS.md after every run, so partial results survive an abort.
#
#   ./run_eval.sh                          all 3 tasks x (dsh, pi)
#   HARNESSES="pi" TASK_IDS="be-ca44c11b" ./run_eval.sh    a subset
#   DRY_RUN=1 ./run_eval.sh                print the plan and the empty table, no API calls
#
# Budget guard (cost from each harness's own JSON token log, $3/1M in, $15/1M out,
# cache write $3.75/1M, cache read $0.30/1M):
#   - ABORT_AT_USD (default 25.00): the whole evaluation stops when the cumulative cost
#     reaches it. A watchdog checks the live log every POLL_S seconds and kills the
#     running harness, so the breaker trips mid-run too, not only between runs.
#   - RUN_MAX_USD (default 4.00): one run is killed at this cost. 6 runs x $4 = $24 max.
#   - A run whose cost cannot be read (no usage in its log) also stops the evaluation.
#
# Safety: literal paths, ${VAR:?} guards, no `rm`. Each harness runs in a systemd scope
# with a RAM cap and a timeout, with a clean environment (only PATH, HOME and the
# Anthropic key: no GITHUB_TOKEN).

source "/home/mukesh/agentic-harness-research/eval/lib.sh"

readonly MODEL="${MODEL:-claude-sonnet-4-6}"      # $3 / $15 per 1M tokens
readonly ABORT_AT_USD="${ABORT_AT_USD:-25.00}"
readonly RUN_MAX_USD="${RUN_MAX_USD:-4.00}"
readonly POLL_S="${POLL_S:-5}"
readonly MEM_MAX="${MEM_MAX:-4G}"
readonly TIMEOUT="${TIMEOUT:-20m}"
readonly MIN_FREE_MB="${MIN_FREE_MB:-4096}"
readonly HARNESSES="${HARNESSES:-dsh pi}"
readonly TASK_IDS="${TASK_IDS:-${TASKS[*]}}"
readonly DRY_RUN="${DRY_RUN:-0}"

readonly RESULTS="/home/mukesh/agentic-harness-research/docs/EVAL_RESULTS.md"
readonly RUN_ID="$(date +%Y%m%d-%H%M%S)"
readonly LOG_DIR="/home/mukesh/agentic-harness-research/eval-logs/$RUN_ID"

TOTAL_USD="0"
ROWS=()          # main 5-column table
DETAIL_ROWS=()   # token breakdown
ABORT_REASON=""

fcmp() { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a >= b) }'; }   # true if a >= b
fadd() { awk -v a="$1" -v b="$2" 'BEGIN { printf "%.4f", a + b }'; }

harness_name() { case "$1" in dsh) echo "DSH" ;; pi) echo "Pi" ;; esac; }

# Build the harness command for one task. The prompt is the last argument.
harness_cmd() {
  local h="${1:?}" task="${2:?}" prompt
  prompt="$(cat "$PROMPT_DIR/$task.md")"
  case "$h" in
    pi)  CMD=(pi -p --mode json --provider anthropic --model "$MODEL"
              --no-context-files --no-approve
              --session-dir "$LOG_DIR/pi-sessions" "$prompt") ;;
    dsh) CMD=("$DSH_BIN" --profile headless --patch "$DSH_PATCH" --json "$prompt") ;;
    *)   die "unknown harness $h" ;;
  esac
}

write_results() {
  mkdir -p "$(dirname "$RESULTS")"
  {
    echo "# Harness Eval Results"
    echo
    echo "- Run ID: \`$RUN_ID\` · Repo: \`Aigerdata/scg-cash-management\` · Model: \`$MODEL\` (both harnesses)"
    echo "- Pricing per 1M tokens: input \$3.00, output \$15.00, cache write \$3.75, cache read \$0.30"
    echo "- Budget: abort at \$$ABORT_AT_USD cumulative, kill a run at \$$RUN_MAX_USD. RAM cap $MEM_MAX, timeout $TIMEOUT per run. Runs are sequential."
    echo "- Accuracy: the real fix's hidden tests are restored, then run (vitest for UI, node:test for app). DB also needs the \`osDocuments\` column in \`ClearAdvance.hdbtable\`."
    echo
    echo "| Task & Category | Harness | Accuracy | Execution Time (s) | Exact USD Cost |"
    echo "|---|---|---|---|---|"
    if (( ${#ROWS[@]} )); then printf '%s\n' "${ROWS[@]}"; fi
    echo
    echo "**Total cost: \$$TOTAL_USD** of \$$ABORT_AT_USD limit."
    if [[ -n "$ABORT_REASON" ]]; then echo; echo "**ABORTED:** $ABORT_REASON"; fi
    echo
    echo "### Token detail"
    echo
    echo "| Task | Harness | Input | Output | Cache write | Cache read | Steps without usage | Log |"
    echo "|---|---|---|---|---|---|---|---|"
    if (( ${#DETAIL_ROWS[@]} )); then printf '%s\n' "${DETAIL_ROWS[@]}"; fi
  } >"$RESULTS"
}

preflight() {
  load_api_key
  command -v pi >/dev/null || die "pi not found"
  [[ -x "$DSH_BIN" ]] || die "dsh not found at $DSH_BIN"
  local free_mb disk_mb http
  free_mb=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
  disk_mb=$(df -Pm "$EVAL_ROOT" | awk 'NR==2 {print $4}')
  (( free_mb >= MIN_FREE_MB )) || die "only ${free_mb} MB RAM available (need $MIN_FREE_MB)"
  (( disk_mb >= 3072 )) || die "only ${disk_mb} MB disk free (need 3072)"
  # Free call: check the model exists for this key. The key goes in via a file
  # descriptor, so it is not visible in `ps`.
  http=$(curl -sS -o /dev/null -w '%{http_code}' \
    -H @<(printf 'x-api-key: %s\nanthropic-version: 2023-06-01\n' "$ANTHROPIC_API_KEY") \
    "https://api.anthropic.com/v1/models/$MODEL") || http="000"
  [[ "$http" == "200" ]] || die "model check for $MODEL returned HTTP $http (bad key or unknown model)"
  log "preflight OK: model $MODEL, ${free_mb} MB RAM free, ${disk_mb} MB disk free"
}

# Run one harness on one task under the RAM cap, the timeout and the cost watchdog.
run_one() {
  local h="${1:?}" task="${2:?}"
  local wt; wt="$(wt_path "$task")"
  local tag="$task-$h" unit="eval-$RUN_ID-$task-$h"
  local out="$LOG_DIR/$tag.jsonl" err="$LOG_DIR/$tag.stderr.log"
  local label="${T_LABEL[$task]:?}"

  safe_reset "$task"
  harness_cmd "$h" "$task"

  log "$tag: start (cap $MEM_MAX, timeout $TIMEOUT, run limit \$$RUN_MAX_USD, spent so far \$$TOTAL_USD)"
  local t0 t1 code=0 killed=""
  t0=$(date +%s)
  (cd "$wt" && exec systemd-run --user --scope -q --unit="$unit" \
      -p MemoryMax="$MEM_MAX" -p MemorySwapMax=0 \
      env -i PATH="/home/mukesh/.local/bin:$PATH" HOME="$HOME" TERM=dumb TIMEOUT="$TIMEOUT" \
        bash -c 'IFS= read -r ANTHROPIC_API_KEY <&3; exec 3<&-; export ANTHROPIC_API_KEY
                 exec timeout --kill-after=30s "$TIMEOUT" "$@"' harness "${CMD[@]}" \
      3<<<"$ANTHROPIC_API_KEY" </dev/null >"$out" 2>"$err") &
  local pid=$!

  # Watchdog: read the live log, stop the run when a cost limit is hit.
  local live
  while kill -0 "$pid" 2>/dev/null; do
    sleep "$POLL_S"
    live=$(node "$COST_JS" "$h" "$out" | jq -r .usd)
    if fcmp "$live" "$RUN_MAX_USD"; then killed="run limit \$$RUN_MAX_USD"; fi
    if fcmp "$(fadd "$TOTAL_USD" "$live")" "$ABORT_AT_USD"; then killed="cumulative limit \$$ABORT_AT_USD"; fi
    if [[ -n "$killed" ]]; then
      log "$tag: cost \$$live hit the $killed - stopping it"
      systemctl --user kill --signal=SIGTERM "$unit.scope" 2>/dev/null || true
      sleep 10
      systemctl --user kill --signal=SIGKILL "$unit.scope" 2>/dev/null || true
      break
    fi
  done
  wait "$pid" || code=$?
  t1=$(date +%s)

  # Final cost from the complete log.
  local c usd in o cw cr unrep
  c=$(node "$COST_JS" "$h" "$out")
  usd=$(jq -r .usd <<<"$c"); in=$(jq -r .input <<<"$c"); o=$(jq -r .output <<<"$c")
  cw=$(jq -r .cacheWrite <<<"$c"); cr=$(jq -r .cacheRead <<<"$c"); unrep=$(jq -r .unreported <<<"$c")
  TOTAL_USD=$(fadd "$TOTAL_USD" "$usd")

  local acc
  if grade "$task" "$LOG_DIR/$tag.grade.log"; then acc="PASS"; else acc="FAIL"; fi
  if [[ $code -eq 124 ]]; then acc="$acc (timeout)"; fi
  if [[ -n "$killed" ]]; then acc="$acc (stopped: $killed)"; fi
  git -C "$wt" diff "${T_BASE[$task]}" -- . ':(exclude)vendor' >"$LOG_DIR/$tag.diff" || true

  local cost_cell="\$$usd"
  if (( unrep > 0 )); then cost_cell="\$$usd + $unrep unreported step(s)"; fi
  ROWS+=("| $label | $(harness_name "$h") | $acc | $((t1 - t0)) | $cost_cell |")
  DETAIL_ROWS+=("| $task | $(harness_name "$h") | $in | $o | $cw | $cr | $unrep | \`eval-logs/$RUN_ID/$tag.jsonl\` |")
  log "$tag: $acc in $((t1 - t0)) s, \$$usd (total \$$TOTAL_USD)"

  safe_reset "$task"
  write_results

  # Stop the whole evaluation on any budget problem.
  if [[ "$killed" == cumulative* ]] || fcmp "$TOTAL_USD" "$ABORT_AT_USD"; then
    ABORT_REASON="cumulative cost \$$TOTAL_USD reached \$$ABORT_AT_USD after $tag"; return 1
  fi
  if (( in + o == 0 )) && (( $((t1 - t0)) > 30 )); then
    ABORT_REASON="no token usage found in the $tag log, so the cost is unknown. Check $err"; return 1
  fi
  if (( unrep > 0 )); then
    ABORT_REASON="$tag has $unrep step(s) without usage, so the true cost is higher than shown"; return 1
  fi
}

main() {
  mkdir -p "$LOG_DIR"
  local task h
  for task in $TASK_IDS; do [[ -n "${T_LABEL[$task]:-}" ]] || die "unknown task $task"; done

  if [[ "$DRY_RUN" == "1" ]]; then
    for task in $TASK_IDS; do for h in $HARNESSES; do
      ROWS+=("| ${T_LABEL[$task]} | $(harness_name "$h") | — | — | — |")
    done; done
    write_results
    log "DRY_RUN: wrote the empty table to $RESULTS. No harness ran."
    return 0
  fi

  preflight
  for task in $TASK_IDS; do       # sequential on purpose: one harness at a time
    for h in $HARNESSES; do
      if ! run_one "$h" "$task"; then
        log "ABORT: $ABORT_REASON"
        write_results
        exit 2
      fi
    done
  done
  write_results
  log "done. Total \$$TOTAL_USD. Results: $RESULTS"
}

main "$@"
