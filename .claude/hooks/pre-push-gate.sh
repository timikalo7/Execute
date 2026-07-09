#!/usr/bin/env bash
# Execute PRE-PUSH GATE — no push, to ANY branch, without the gates passing on what's pushed.
# Runs from two directions so it can't be forgotten:
#   1. Claude Code PreToolUse hook (.claude/hooks/pre-push-guard.sh) blocks the `git push` Bash call.
#   2. git pre-push hook (.githooks/pre-push; core.hooksPath set each SessionStart) blocks manual pushes.
#
# What it enforces, per project the push touches:
#   SECURITY       security-gate scan (secrets / TLS / committed .env / npm audit)      → must pass
#   SYSTEM DESIGN  system-design-gate (lockfile / .env.example / SQL interp / …)        → must pass
#   LEARNER        code changed ⇒ PROJECT-LOG.md updated in the same push               → must hold
#   VISUAL-QA      front-end changed ⇒ a fresh .vqa-pass.json stamp matching the tree   → must hold
# Plus a repo-root security scan when non-project (meta/memory/skills) files changed.
#
# Usage: pre-push-gate.sh [range]      (range defaults to origin/<branch>..HEAD)
# Exit non-zero = push blocked. EXECUTE_GATE_BYPASS=1 skips (owner emergency only, loudly).
set -u
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if [ "${EXECUTE_GATE_BYPASS:-0}" = "1" ]; then
  echo "gate: ⚠️  BYPASSED via EXECUTE_GATE_BYPASS=1 — owner-emergency escape hatch. Log why in PROJECT-LOG.md." >&2
  exit 0
fi

RANGE="${1:-}"
BR="$(git rev-parse --abbrev-ref HEAD)"
if [ -z "$RANGE" ]; then
  if git rev-parse --verify -q "origin/$BR" >/dev/null 2>&1; then
    RANGE="origin/$BR..HEAD"
  else
    BASE="$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD origin/master 2>/dev/null || true)"
    RANGE="${BASE:+$BASE..HEAD}"
  fi
fi

CHANGED="$(git diff --name-only ${RANGE:+$RANGE} 2>/dev/null || true)"
if [ -z "$CHANGED" ]; then
  echo "gate: nothing new to push in range '${RANGE:-<none>}' — pass"
  exit 0
fi

echo "gate: checking push range ${RANGE:-<all>} ($(printf '%s\n' "$CHANGED" | wc -l) files)"
FAILED=0
fail() { echo "gate: ❌ $*" >&2; FAILED=1; }

PROJECTS="$(printf '%s\n' "$CHANGED" | sed -n 's|^projects/\([^/]*\)/.*|\1|p' | sort -u)"
META="$(printf '%s\n' "$CHANGED" | grep -v '^projects/' || true)"

# ---------- SECURITY ----------
if [ -n "$META" ]; then
  echo "gate: security-gate (repo root — meta files changed)"
  # excluded: projects (scanned individually below), skill-library (vendored third-party examples),
  # security-gate (the scanner's own rule definitions match themselves)
  node .claude/skills/security-gate/scan.mjs --dir . --exclude projects,skill-library,security-gate || fail "security-gate FAILED at repo root"
fi
for P in $PROJECTS; do
  echo "gate: security-gate projects/$P"
  node .claude/skills/security-gate/scan.mjs --dir "projects/$P" || fail "security-gate FAILED for projects/$P"
done

# ---------- SYSTEM DESIGN ----------
for P in $PROJECTS; do
  echo "gate: system-design-gate projects/$P"
  node .claude/skills/system-design-gate/check.mjs --dir "projects/$P" || fail "system-design-gate FAILED for projects/$P"
done

# ---------- LEARNER (PROJECT-LOG discipline) ----------
for P in $PROJECTS; do
  CODE_CHANGED="$(printf '%s\n' "$CHANGED" | grep "^projects/$P/" | grep -vE '(PROJECT-LOG\.md|STATUS\.md|SETUP-KEYS\.md|LAUNCH-CHECKLIST\.md|README\.md|\.vqa-pass\.json|\.visual-qa\.json|security-gate-report\.json)$' || true)"
  LOG_CHANGED="$(printf '%s\n' "$CHANGED" | grep -c "^projects/$P/PROJECT-LOG\.md$" || true)"
  if [ -n "$CODE_CHANGED" ] && [ "${LOG_CHANGED:-0}" = "0" ]; then
    fail "LEARNER gate projects/$P: code changed but PROJECT-LOG.md has no entry in this push.
        → append a dated entry (went well / broke + fix / decisions) — or run the learner agent — commit it, push again."
  fi
done

# ---------- VISUAL-QA freshness (web projects with a front-end change) ----------
for P in $PROJECTS; do
  ls "projects/$P"/next.config.* >/dev/null 2>&1 || continue   # only web builds the sweep can drive
  FE="$(printf '%s\n' "$CHANGED" | grep -E "^projects/$P/(src|public|app|components)/" || true)"
  [ -z "$FE" ] && continue
  STAMP="projects/$P/.vqa-pass.json"
  WANT="$(bash .claude/hooks/tree-hash.sh "projects/$P/src" "projects/$P/public" "projects/$P/package.json")"
  HAVE="$(python3 -c "import json;print(json.load(open('$STAMP')).get('treeHash',''))" 2>/dev/null || true)"
  if [ "$WANT" != "$HAVE" ]; then
    fail "VISUAL-QA gate projects/$P: no fresh pass for this exact tree (stamp ${HAVE:-missing}).
        → run: bash .claude/skills/visual-qa/run.sh projects/$P   (writes $STAMP on pass) — commit it, push again."
  else
    echo "gate: visual-qa stamp fresh for projects/$P"
  fi
done

# ---------- verdict ----------
if [ "$FAILED" = "1" ]; then
  echo "gate: PUSH BLOCKED — fix the failures above, commit, push again. (security-reviewer agent still required for any backend/auth/DB/payments surface — a scanner can't reason.)" >&2
  exit 1
fi
echo "gate: ✅ all gates pass — push allowed"
exit 0
