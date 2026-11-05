# eval/lib.sh: shared constants, task table, guards and graders.
# Sourced by eval/setup_worktrees.sh and run_eval.sh. Do not run it directly.
#
# Safety rules in this file:
#   - Every path is a literal constant. Nothing is built from an unset variable.
#   - Every function argument uses ${n:?} so an empty value stops the script.
#   - No `rm`. Resets use git inside a verified eval worktree only.

set -euo pipefail

readonly EVAL_ROOT="/home/mukesh/agentic-harness-research"
readonly MAIN_REPO="/home/mukesh/agentic-harness-research/scg-cash-management"
readonly WT_ROOT="/home/mukesh/agentic-harness-research/eval-worktrees"
readonly ENV_FILE="/home/mukesh/agentic-harness-research/.env"
readonly PROMPT_DIR="/home/mukesh/agentic-harness-research/eval/prompts"
readonly COST_JS="/home/mukesh/agentic-harness-research/eval/cost.mjs"
readonly DSH_PATCH="/home/mukesh/agentic-harness-research/eval/dsh-anthropic.patch.yml"
readonly DSH_BIN="/home/mukesh/.local/bin/dsh"

# ---- Task table --------------------------------------------------------------
# base = the commit before the fix (the harness starts here)
# fix  = the real fix commit (its test files are the hidden grader)
readonly TASKS=(ui-b1716e69 db-703e4984 be-ca44c11b)

declare -gA T_LABEL T_BASE T_FIX T_TESTS T_CMD T_DEPS

T_LABEL[ui-b1716e69]="log #274 remove last Transportation/Accommodation box (b1716e69) - UI Change"
T_BASE[ui-b1716e69]="f7365a2b92f0f48a19e1c169aa680c46b8f5c4ae"
T_FIX[ui-b1716e69]="b1716e6984433587ce601520b9183402e01d743e"
T_TESTS[ui-b1716e69]="web/src/components/reimbursement/__tests__/ReimbExpenseTab.removeLastBox.test.jsx"
T_CMD[ui-b1716e69]="cd web && npx vitest run src/components/reimbursement/__tests__/ReimbExpenseTab.removeLastBox.test.jsx"
T_DEPS[ui-b1716e69]="web"

T_LABEL[db-703e4984]="persist OS review documents on ClearAdvance (703e4984) - DB Change"
T_BASE[db-703e4984]="820566130339118e09371eecf3c1d7ec70b09105"
T_FIX[db-703e4984]="703e498405d39cddccba0323126deed9ad502483"
T_TESTS[db-703e4984]="app/test/api-clear-advance.test.ts"
T_CMD[db-703e4984]="cd app && npx tsx --test test/api-clear-advance.test.ts"
T_DEPS[db-703e4984]="app appforge"

T_LABEL[be-ca44c11b]="log #243 keep posted SAP docs after resubmit (ca44c11b) - Backend Correction"
T_BASE[be-ca44c11b]="027eeb3faec1ae4065c2c13027acb57882f626e4"
T_FIX[be-ca44c11b]="ca44c11b7ad7676371995e77e68f98af47aef024"
T_TESTS[be-ca44c11b]="app/test/sap-stale-docs.test.ts"
T_CMD[be-ca44c11b]="cd app && npx tsx --test test/sap-stale-docs.test.ts"
T_DEPS[be-ca44c11b]="app"

# DB task: the target test, and 3 tests that already fail at both the base and the
# fix commit (checked 2026-11-05). Those 3 may fail; any other failure is a FAIL.
readonly DB_TARGET_TEST="matrix v2: clear phase walks pendingClearAdvance -> pendingFinalClearAdvance; OS uses pendingOSClearAdvance"
readonly DB_KNOWN_FAILS=(
  "save AND submit gate VAT/WHT lines on supplier + invoice no. + invoice date; V0 exempt"
  "SCG-98: save AND submit refuse a billed item without a receipt attachment, naming the row"
  "SCG-94: non-numeric clear amounts are refused per box/item, negative and zero items still save"
)

# ---- Helpers -------------------------------------------------------------------
log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

wt_path() { printf '%s/%s' "$WT_ROOT" "${1:?task id required}"; }

# Stop unless $1 is a registered worktree of MAIN_REPO directly under WT_ROOT.
assert_eval_worktree() {
  local wt="${1:?worktree path required}"
  case "$wt" in
    "$WT_ROOT"/*) ;;
    *) die "refusing: $wt is not under $WT_ROOT" ;;
  esac
  [[ -d "$wt" ]] || die "refusing: $wt does not exist"
  git -C "$MAIN_REPO" worktree list --porcelain | grep -Fxq "worktree $wt" \
    || die "refusing: $wt is not a registered worktree of $MAIN_REPO"
  [[ "$(git -C "$wt" rev-parse --show-toplevel)" == "$wt" ]] \
    || die "refusing: git top level of $wt is not $wt"
}

# Put a worktree back to its base commit. Tracked files are restored and new
# untracked files are cleaned. Ignored files (node_modules) and the vendor/appforge
# gitlink directory are kept.
safe_reset() {
  local task="${1:?task id required}"
  local wt; wt="$(wt_path "$task")"
  assert_eval_worktree "$wt"
  git -C "$wt" reset -q --hard "${T_BASE[$task]:?unknown task $task}"
  git -C "$wt" clean -q -fd
  [[ "$(git -C "$wt" rev-parse HEAD)" == "${T_BASE[$task]}" ]] || die "$task: HEAD is not the base commit"
}

# Read ANTHROPIC_API_KEY from .env without sourcing it and without printing it.
load_api_key() {
  [[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found"
  local key
  key="$(sed -n 's/^ANTHROPIC_API_KEY=//p' "$ENV_FILE" | head -n 1 | tr -d "\r\"' ")"
  [[ -n "$key" ]] || die "ANTHROPIC_API_KEY is empty in $ENV_FILE"
  export ANTHROPIC_API_KEY="$key"
}

# ---- Grading -------------------------------------------------------------------
# grade <task> <output-file>  -> exit 0 = PASS, 1 = FAIL.
# Restores the fix commit's test files first, so a harness cannot pass by
# editing or deleting tests.
grade() {
  local task="${1:?task id required}" out="${2:?output file required}"
  local wt; wt="$(wt_path "$task")"
  assert_eval_worktree "$wt"
  local f
  for f in ${T_TESTS[$task]}; do
    git -C "$wt" checkout -q "${T_FIX[$task]}" -- "$f"
  done
  local code=0
  (cd "$wt" && timeout 600 bash -c "${T_CMD[$task]}") >"$out" 2>&1 || code=$?

  case "$task" in
    db-*) grade_db "$wt" "$out" ;;
    *)    return "$code" ;;        # vitest / node:test exit code
  esac
}

# DB task: the target test passes, no new failures, and the generated HANA table
# definition has the new column.
grade_db() {
  local wt="${1:?}" out="${2:?}"
  sed -n 's/^ok [0-9]* - //p' "$out" | grep -Fxq -- "$DB_TARGET_TEST" \
    || { echo "GRADE: target test did not pass" >>"$out"; return 1; }
  local name allowed bad=0 k
  while IFS= read -r name; do
    allowed=0
    for k in "${DB_KNOWN_FAILS[@]}"; do [[ "$name" == "$k" ]] && allowed=1; done
    if (( ! allowed )); then echo "GRADE: new failure: $name" >>"$out"; bad=1; fi
  done < <(sed -n 's/^not ok [0-9]* - //p' "$out")
  (( bad == 0 )) || return 1
  grep -qi '"OSDOCUMENTS"' "$wt/app/generated/db/ClearAdvance.hdbtable" \
    || { echo "GRADE: ClearAdvance.hdbtable has no osDocuments column" >>"$out"; return 1; }
}
