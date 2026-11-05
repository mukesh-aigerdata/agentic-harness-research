#!/usr/bin/env bash
# eval/setup_worktrees.sh: prepare one git worktree per task at the commit BEFORE its fix.
#
#   eval/setup_worktrees.sh            create/repair worktrees, install deps, reset to base
#   eval/setup_worktrees.sh --verify   also prove each grader: base = FAIL, real fix = PASS
#
# Safe by design: literal paths, ${VAR:?} guards, no `rm`. It makes no API calls,
# so it costs $0. The vendor/appforge framework copy is made read-only so a harness
# cannot change it.

source "/home/mukesh/agentic-harness-research/eval/lib.sh"

VERIFY=0
if [[ "${1:-}" == "--verify" ]]; then VERIFY=1; fi

readonly APPFORGE_SRC="/home/mukesh/agentic-harness-research/scg-cash-management/vendor/appforge"
[[ -f "$APPFORGE_SRC/package.json" ]] || die "appforge submodule is not checked out in $MAIN_REPO"

export CI=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

for task in "${TASKS[@]}"; do
  wt="$(wt_path "$task")"
  base="${T_BASE[$task]:?}"

  if [[ ! -d "$wt" ]]; then
    log "$task: create worktree at $base"
    git -C "$MAIN_REPO" worktree add -q --detach "$wt" "$base"
  fi
  assert_eval_worktree "$wt"
  safe_reset "$task"

  # vendor/appforge: a plain copy of the pinned framework (same pin for all 3 tasks).
  af="$wt/vendor/appforge"
  if [[ ! -f "$af/package.json" ]]; then
    log "$task: copy appforge framework"
    mkdir -p "$wt/vendor"
    cp -a "$APPFORGE_SRC/." "$af/"
  fi
  # A copied submodule .git file points at a module dir that does not exist here and
  # breaks `git status`. Move it aside (no delete).
  if [[ -f "$af/.git" ]]; then
    mv -- "$af/.git" "$af/.git.copied-gitlink"
  fi

  for dep in ${T_DEPS[$task]}; do
    case "$dep" in
      web)
        [[ -d "$wt/web/node_modules" ]] || { log "$task: pnpm install (web)"; (cd "$wt/web" && pnpm install --frozen-lockfile --reporter=silent); } ;;
      app)
        [[ -d "$wt/app/node_modules" ]] || { log "$task: pnpm install (app)"; (cd "$wt/app" && pnpm install --frozen-lockfile --reporter=silent); }
        (cd "$wt/app" && bash ../scripts/link-appforge.sh >/dev/null) ;;
      appforge)
        # Needed for `pnpm gen` (codegen). Install before the tree is made read-only.
        [[ -d "$af/node_modules" ]] || { chmod -R u+w "$af"; log "$task: pnpm install (appforge)"; (cd "$af" && pnpm install --frozen-lockfile --reporter=silent); } ;;
    esac
  done
  chmod -R a-w "$af/packages"

  log "$task: ready at $(git -C "$wt" rev-parse --short HEAD) ($wt)"
done

if (( VERIFY )); then
  readonly VERIFY_DIR="/home/mukesh/agentic-harness-research/eval-logs/verify"
  mkdir -p "$VERIFY_DIR"
  for task in "${TASKS[@]}"; do
    wt="$(wt_path "$task")"
    safe_reset "$task"
    if grade "$task" "$VERIFY_DIR/$task.base.log"; then b=PASS; else b=FAIL; fi
    safe_reset "$task"
    # Apply the whole real fix (except the vendor gitlink), then grade.
    git -C "$wt" diff --name-only "${T_BASE[$task]}" "${T_FIX[$task]}" -- . ':(exclude)vendor' \
      | while IFS= read -r f; do git -C "$wt" checkout -q "${T_FIX[$task]}" -- "$f"; done
    if grade "$task" "$VERIFY_DIR/$task.fix.log"; then a=PASS; else a=FAIL; fi
    safe_reset "$task"
    if [[ $b == FAIL && $a == PASS ]]; then ok=OK; else ok="BROKEN (want base=FAIL fix=PASS)"; fi
    log "verify $task: base=$b fix=$a -> $ok"
  done
fi
