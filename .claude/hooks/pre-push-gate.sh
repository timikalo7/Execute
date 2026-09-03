#!/usr/bin/env bash
# Execute PRE-PUSH GATE — no push, to ANY branch, without the gates passing on what's pushed.
# Runs from two directions so it can't be forgotten:
#   1. Claude Code PreToolUse hook (.claude/hooks/pre-push-guard.sh) blocks the `git push` Bash call.
#   2. git pre-push hook (.githooks/pre-push; core.hooksPath set each SessionStart) blocks manual pushes.
#
# What it enforces, per project the push touches:
#   SECURITY       security-gate scan (secrets / TLS / committed .env / npm audit)      → must pass
#   SYSTEM DESIGN  system-design-gate (lockfile / .env.example / SQL interp / …)        → must pass
#   RUNTIME        runtime-eval.sh — the project's actual user journey, executed          → must pass
#   TESTS          testable code changed ⇒ the project's `npm test` suite passes         → must hold
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
# A project deleted in this push has nothing to gate — drop projects whose dir no longer exists.
PROJECTS="$(for p in $PROJECTS; do [ -d "projects/$p" ] && echo "$p"; done)"
META="$(printf '%s\n' "$CHANGED" | grep -v '^projects/' || true)"

# ---------- SECURITY ----------
if [ -n "$META" ]; then
  echo "gate: security-gate (repo root — meta files changed)"
  # excluded: projects (scanned individually below), skill-library (vendored third-party examples),
  # security-gate (the scanner's own rule definitions match themselves)
  node .claude/skills/security-gate/scan.mjs --dir . --exclude projects,skill-library,security-gate || fail "security-gate FAILED at repo root"
fi

# ---------- DEBT RATCHET ----------
# Runs on EVERY push, not only when meta files change: the deferred-work markers accumulate from
# project work as readily as from repo work, and a pile checked only sometimes grows the rest of the
# time. Repo-wide, because that is the scope its budget was measured on. The markers themselves are
# listed in debt-ratchet.mjs and deliberately NOT repeated here — this file is inside the scan, and
# naming them in a comment would count the wiring as the debt. That is the third time a
# literal-pattern scanner has counted a file that merely documents it.
echo "gate: debt-ratchet (deferred-work markers)"
node .claude/skills/security-gate/debt-ratchet.mjs || fail "debt-ratchet FAILED — a debt pile grew"

# ---------- SDLC ARTIFACT CHAIN ----------
# Anthropic's AI-native SDLC: every stage commits an artifact and the chain is the audit trail.
# Existing projects are grandfathered in chain-baseline.json, so this blocks a NEW project that was
# built with no intent, spec or plan rather than retro-failing the ten that predate the rule.
echo "gate: sdlc-chain (artifact trail for new projects)"
node .claude/skills/sdlc-chain/check.mjs --all >/dev/null || {
  node .claude/skills/sdlc-chain/check.mjs --all | tail -20
  fail "sdlc-chain FAILED — a project outside the baseline is missing its planning artifacts"
}
for P in $PROJECTS; do
  echo "gate: security-gate projects/$P"
  node .claude/skills/security-gate/scan.mjs --dir "projects/$P" || fail "security-gate FAILED for projects/$P"
done

# ---------- SYSTEM DESIGN ----------
for P in $PROJECTS; do
  echo "gate: system-design-gate projects/$P"
  node .claude/skills/system-design-gate/check.mjs --dir "projects/$P" || fail "system-design-gate FAILED for projects/$P"
done

# ---------- TESTS (run the project's suite when the push touches testable code) ----------
# Owner rule: tests run on every push that touches anything connected to a test.
for P in $PROJECTS; do
  pkg="projects/$P/package.json"
  [ -f "$pkg" ] || continue
  # only when this push changed actual code/tests (not a docs-only push)
  TESTABLE="$(printf '%s\n' "$CHANGED" | grep "^projects/$P/" | grep -E '\.(ts|tsx|js|jsx|mjs|cjs)$' || true)"
  [ -z "$TESTABLE" ] && continue
  # does the project define a real test script (not the create-next-app placeholder)?
  HAS_TEST="$(node -e "try{const s=(require('./$pkg').scripts)||{};process.stdout.write(s.test&&!/no test specified/.test(s.test)?'1':'')}catch(e){}" 2>/dev/null)"
  [ -z "$HAS_TEST" ] && continue
  if [ ! -d "projects/$P/node_modules" ]; then
    echo "gate: ⚠️  TESTS projects/$P — code changed but node_modules missing; can't run tests locally (CI runs them). Run 'npm ci' in the project to gate locally." >&2
    continue
  fi
  echo "gate: tests projects/$P (npm test)"
  # timeout guards a hung jest (open-handle leak — use --forceExit in the project's test script);
  # --passWithNoTests so a partial push touching code with no matching test yet doesn't false-block.
  if ! ( cd "projects/$P" && CI=1 timeout 600 npm test --silent -- --passWithNoTests >&2 ); then
    fail "TESTS projects/$P: the test suite failed (or timed out) — fix tests/code, commit, push again."
  fi
done

# ---------- RUNTIME (does the thing actually RUN?) ----------
# The gap this closes, and it was found the hard way: every other gate here READS the artifact.
# security-gate greps it, system-design-gate checks its shape, npm test exercises units written by
# whoever wrote the bug. None of them RUN it. an example build graph shipped green and had never once been
# executed end to end — the owner pointed that out, and they were right that a gate which does not
# force the check is not a gate.
#
# So a project with a declared journey in runtime-eval.sh must complete it before it can be pushed.
# A project with no journey declared is SKIPPED LOUDLY rather than silently: an absent check reports
# itself as absent (memory/agent-graph-engineering.md §5), because "no journey" is how this stops
# applying without anyone noticing.
RUNTIME_EVAL=".claude/skills/agentic-coding-graph/runtime-eval.sh"
for P in $PROJECTS; do
  CODE_CHANGED="$(printf '%s\n' "$CHANGED" | grep "^projects/$P/" | grep -E '\.(ts|tsx|js|jsx|mjs|cjs|sh|ps1)$' || true)"
  [ -z "$CODE_CHANGED" ] && continue
  if ! grep -q "journey_${P//-/_}()" "$RUNTIME_EVAL" 2>/dev/null; then
    echo "gate: ⚠️  RUNTIME projects/$P — NOT CHECKED: no journey_${P//-/_} in runtime-eval.sh. Nothing ran this project end to end." >&2
    continue
  fi
  echo "gate: runtime-eval projects/$P"
  bash "$RUNTIME_EVAL" "$P" >&2 || fail "RUNTIME projects/$P: the user journey broke. The tests may be green; the product is not."
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
  # Front-end change = source dirs OR anything that changes how the site RENDERS: dependency bumps
  # (a Next/Tailwind/sharp version can move pixels), build config, and the styling config. A
  # dependency-only push used to skip this sweep entirely — found when the an example marketing site npm-audit fix
  # rebuilt the whole site without ever triggering visual-qa (memory/agent-graph-engineering.md §5:
  # a check that silently stops applying is the evaluator-decay failure).
  # NB: the stamp's tree-hash below already includes package.json, so a dep bump correctly
  # invalidates a stale stamp — the gap was only that the sweep was never *demanded*.
  FE="$(printf '%s\n' "$CHANGED" \
    | grep -E "^projects/$P/(src|public|app|components)/|^projects/$P/(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lock(b)?|next\.config\.[a-z]+|tailwind\.config\.[a-z]+|postcss\.config\.[a-z]+)$" || true)"
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
