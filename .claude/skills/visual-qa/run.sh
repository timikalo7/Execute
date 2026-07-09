#!/usr/bin/env bash
# visual-qa/run.sh — one command that actually runs the gate end to end.
#
# Does everything the sweep needs so it can't fail on setup:
#   build the project → serve the static export → auto-detect routes → point the
#   sweep at Playwright's browsers + axe-core → sweep → tear the server down →
#   exit with the sweep's code (non-zero fails the build).
#
# Usage:
#   bash .claude/skills/visual-qa/run.sh [project-dir] [--no-build] [--widths 390 768 1440] [--routes / /about ...]
#   (project-dir defaults to the current directory; routes auto-detected from out/ if omitted)
#   --no-build: reuse the existing verified build instead of rebuilding. Use when Turbopack on the
#   slow workspace FS builds nondeterministically (missing chunk → 500) — build+verify by hand,
#   THEN sweep the exact artifact you verified.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PROJ="${1:-$PWD}"; [ -d "$PROJ" ] && shift 2>/dev/null || PROJ="$PWD"
PROJ="$(cd "$PROJ" && pwd)"
cd "$PROJ" || { echo "vqa: no such dir $PROJ" >&2; exit 2; }
[ -f package.json ] || { echo "vqa: no package.json in $PROJ" >&2; exit 2; }

# Kill any server a previous (crashed/killed) run left behind — orphans squat ports and make a
# later sweep measure the WRONG SITE (happened: a an example marketing site server answered a example-web sweep).
PIDFILE=/tmp/vqa-srv.pid
if [ -f "$PIDFILE" ]; then
  OLD="$(cat "$PIDFILE" 2>/dev/null)"
  [ -n "$OLD" ] && kill "$OLD" 2>/dev/null && echo "vqa: killed stale server pid $OLD from a previous run"
  rm -f "$PIDFILE"
fi
# And refuse to reuse a busy port regardless: walk up until a free one is found.
PORT="${VQA_PORT:-8791}"
while curl -sf -o /dev/null --max-time 1 "http://localhost:$PORT/" 2>/dev/null; do
  echo "vqa: port $PORT is already serving something — trying $((PORT + 1))"
  PORT=$((PORT + 1))
done

# Hard time budgets so a hung build/server/sweep can never wedge a session or leave orphans:
# build ≤ VQA_BUILD_TIMEOUT (600s), sweep ≤ VQA_TIMEOUT (480s). timeout(1) kills the whole tree.
BUILD_TIMEOUT="${VQA_BUILD_TIMEOUT:-600}"
SWEEP_TIMEOUT="${VQA_TIMEOUT:-480}"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
# axe-core: prefer the project's, else the skill's own node_modules — sweep also self-detects.
for a in "$PROJ/node_modules/axe-core/axe.min.js" "$HERE/node_modules/axe-core/axe.min.js"; do
  [ -f "$a" ] && export AXE="$a" && break
done

NO_BUILD=0
for a in "$@"; do [ "$a" = "--no-build" ] && NO_BUILD=1; done
if [ "$NO_BUILD" = "1" ]; then
  # strip the flag so it isn't forwarded to the sweep
  NEWARGS=(); for a in "$@"; do [ "$a" != "--no-build" ] && NEWARGS+=("$a"); done
  set -- "${NEWARGS[@]:-}"
  echo "vqa: --no-build — sweeping the existing build"
else
  echo "vqa: building $PROJ …"
  # a stale/broken .next breaks Turbopack builds. If it's a relocation SYMLINK (the slow-FS
  # workaround: .next -> fast local disk), keep the link and empty its target; else remove it.
  if [ -L .next ]; then TGT="$(readlink -f .next)"; rm -rf "${TGT:?}"/* 2>/dev/null; else rm -rf .next 2>/dev/null; fi
  if ! timeout --kill-after=10 "$BUILD_TIMEOUT" npm run build >/tmp/vqa-build.log 2>&1; then
    RC=$?
    [ "$RC" -ge 124 ] && echo "vqa: BUILD TIMED OUT after ${BUILD_TIMEOUT}s" >&2
    echo "vqa: BUILD FAILED — the gate can't run. Tail:" >&2; tail -25 /tmp/vqa-build.log >&2; exit 1
  fi
fi

# Locate the servable output dir (static export = out/; fallback to dist/build/public).
# No static dir but a completed .next build ⇒ server-mode Next app: serve it with `next start`.
OUT=""; for d in out dist build public .; do [ -f "$PROJ/$d/index.html" ] && OUT="$PROJ/$d" && break; done
SRV=""
if [ -n "$OUT" ]; then
  echo "vqa: serving $OUT on :$PORT"
  ( cd "$OUT" && python3 -m http.server "$PORT" >/tmp/vqa-http.log 2>&1 ) &
  SRV=$!
elif [ -f "$PROJ/.next/BUILD_ID" ]; then
  echo "vqa: no static export — starting next server on :$PORT"
  ( cd "$PROJ" && npx next start -p "$PORT" >/tmp/vqa-http.log 2>&1 ) &
  SRV=$!
else
  echo "vqa: no built index.html and no .next build found" >&2; exit 1
fi
echo "$SRV" > "$PIDFILE"
trap 'kill "$SRV" 2>/dev/null; rm -f "$PIDFILE"' EXIT
# wait for the server — fail loud if it never comes up (don't sweep a dead/foreign server)
UP=0
for _ in $(seq 1 60); do curl -sf "http://localhost:$PORT/" >/dev/null 2>&1 && UP=1 && break; sleep 0.5; done
if [ "$UP" != "1" ]; then
  echo "vqa: server never came up on :$PORT — aborting. Server log tail:" >&2
  tail -15 /tmp/vqa-http.log >&2; exit 1
fi

# Auto-detect routes from the built output unless --routes was passed.
ARGS=("$@")
if ! printf '%s\0' "${ARGS[@]:-}" | grep -qz -- '--routes'; then
  ROUTES=()
  if [ -n "$OUT" ]; then
    ROUTES=("/")
    while IFS= read -r r; do ROUTES+=("/$r"); done < <(cd "$OUT" && find . -mindepth 2 -maxdepth 2 -name index.html -printf '%h\n' 2>/dev/null | sed 's|^\./||' | grep -vE '^(_next|404|assets)' | sort -u)
  else
    # server mode: prerendered routes from the manifest
    while IFS= read -r r; do ROUTES+=("$r"); done < <(python3 -c "
import json
m = json.load(open('$PROJ/.next/prerender-manifest.json'))
for k in sorted(m.get('routes', {})):
    # skip Next internals (/_global-error, /_not-found) and non-page assets
    if k.startswith('/_'): continue
    if any(s in k for s in ('.txt', '.xml', '.ico', 'manifest')): continue
    print(k)")
    [ "${#ROUTES[@]}" -gt 0 ] || ROUTES=("/")
  fi
  ARGS+=(--routes "${ROUTES[@]}")
fi
printf '%s\0' "${ARGS[@]:-}" | grep -qz -- '--widths' || ARGS+=(--widths 390 768 1440)
printf '%s\0' "${ARGS[@]:-}" | grep -qz -- '--src' || ARGS+=(--src "$PROJ/src")

echo "vqa: sweeping… (budget ${SWEEP_TIMEOUT}s)"
timeout --kill-after=10 "$SWEEP_TIMEOUT" node "$HERE/sweep.mjs" --base "http://localhost:$PORT" "${ARGS[@]}"
CODE=$?
[ "$CODE" -ge 124 ] && echo "vqa: SWEEP TIMED OUT after ${SWEEP_TIMEOUT}s (raise VQA_TIMEOUT if the site is just big)" >&2

# On pass, stamp the exact tree that passed (.vqa-pass.json). The pre-push gate recomputes the
# hash and blocks the push if the front-end changed since this run — so "the sweep passed at some
# point" can never stand in for "the sweep passed on what you're pushing". COMMIT the stamp.
REPO="$(cd "$HERE/../../.." && pwd)"
if [ "$CODE" -eq 0 ]; then
  RELP="${PROJ#"$REPO"/}"
  HASH="$(bash "$REPO/.claude/hooks/tree-hash.sh" "$RELP/src" "$RELP/public" "$RELP/package.json")"
  printf '{"treeHash":"%s","date":"%s","note":"visual-qa pass; verified by pre-push gate"}\n' \
    "$HASH" "$(date -u +%FT%TZ)" > "$PROJ/.vqa-pass.json"
  echo "vqa: pass stamp written to $RELP/.vqa-pass.json — commit it with your changes"
fi
echo "vqa: exit $CODE (0 = pass)"
exit $CODE
