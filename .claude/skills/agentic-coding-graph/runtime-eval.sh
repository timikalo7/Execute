#!/usr/bin/env bash
# RUNTIME EVALUATION — run the thing the way a person will, not the way its tests do.
#
# The gap this closes, stated plainly: every gate in this repo READS the artifact. security-gate
# greps it, system-design-gate checks its shape, npm test exercises its units. None of them RUN it
# end to end. A project can have every self-test green and still be broken the moment someone opens
# it, because unit tests are written by whoever wrote the bug.
#
# So this executes the actual user journey for a project and fails loudly when the journey breaks.
# It is the "deploy it and run it" evaluator, and it belongs BEFORE the review stage, not after.
#
#   bash .claude/skills/agentic-coding-graph/runtime-eval.sh <project>
#   bash .claude/skills/agentic-coding-graph/runtime-eval.sh --self-test
#
# Exit 0 = the journey completed. Non-zero = it did not, and the failing step is named.
set -uo pipefail

# Rebuild when the export is STALE, not merely when it is absent.
#
# This used to be `out_is_stale && step "build"`, which skips the build whenever any out/ exists — so
# the gate happily measured a stale export and reported it as the state of the tree being pushed. It
# cost a real false alarm: a display-width regression was fixed, committed, and the gate still failed
# the push on the OLD build, reporting 0.903 em/cap against a tree that measured 0.829.
#
# A checker that can pass or fail on code other than the code under test is not checking anything.
out_is_stale() {
  [ -d out ] || return 0
  # any source newer than the export means the export does not describe this tree
  [ -n "$(find src app pages lib public package.json next.config.* -newer out -print -quit 2>/dev/null)" ]
}

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
PROJ="${1:-}"
FAILED=0
STEPS=0

step() { # step <name> <command...>
  local name="$1"; shift
  STEPS=$((STEPS + 1))
  printf '  %-46s ' "$name"
  local out
  if out="$("$@" 2>&1)"; then
    echo "ok"
  else
    echo "FAILED"
    echo "$out" | tail -6 | sed 's/^/        /'
    FAILED=$((FAILED + 1))
  fi
}


# --------------------------------------------------------------- journeys
#
# The journeys below are TEMPLATES. Copy one, rename it for your project, and wire it into the
# `case` at the bottom. They are deliberately generic: a journey is only worth anything when it
# walks YOUR product's real path, so treat these as the shape, not the content.

# TEMPLATE — a served web app (Next.js, Vite, any dev/prod server).
journey_example_web() {
  local d="$ROOT/projects/example-web"
  [ -d "$d" ] || { echo "  (no such project — copy this template and point it at yours)"; return 3; }
  [ -d "$d/node_modules" ] || { echo "  (no node_modules — run npm ci first)"; return 3; }
  cd "$d" || return 3

  # The app has to be BUILT and SERVED to be walked. A journey against a dev server would be testing
  # something the user never receives.
  out_is_stale && step "build" bash -c 'npm run build >/tmp/re-build.log 2>&1 || { tail -20 /tmp/re-build.log; false; }'

  local port=3117
  # Free the port first: an orphan from a killed run squats it and the next walk silently
  # measures the WRONG SITE.
  fuser -k "$port/tcp" >/dev/null 2>&1 || true
  npm start -- -p "$port" >/tmp/re-serve.log 2>&1 &
  local pid=$!

  # READY means ready, and `/` is a bad proxy for it. A server can serve a prerendered landing page
  # the instant it binds the port while a client-rendered route is still warming — so a loop that
  # waits on `/` hands the walker a half-started server and the journey fails branches a warm server
  # passes. That is the gate lying, not the product breaking. Wait on a route that actually
  # exercises the app, then give it a beat.
  local tries=0
  until curl -sf -o /dev/null "http://localhost:$port/" 2>/dev/null; do
    tries=$((tries + 1))
    [ "$tries" -gt 60 ] && { echo "  (server never came up — see /tmp/re-serve.log)"; kill "$pid" 2>/dev/null; return 3; }
    sleep 1
  done
  sleep 2

  step "a visitor can walk the whole site" node scripts/journey.mjs --base "http://localhost:$port"

  # Kill the process GROUP, not just the pid spawned: `npx`/`npm` fork, and killing the wrapper
  # leaves the real server holding the port for the next run to trip over.
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  fuser -k "$port/tcp" >/dev/null 2>&1 || true
}

# TEMPLATE — a STATIC EXPORT served as files.
#
# The serving flag matters. `serve -s` turns on single-page-app fallback, which rewrites every
# unmatched path to index.html and returns 200 — under that flag a 404 branch fails and looks like a
# real defect on a healthy site. Served the way a static host actually serves it, the export's own
# 404.html answers correctly. A journey run against the wrong server configuration reports the
# server, not the product.
journey_example_static() {
  local d="$ROOT/projects/example-static"
  [ -d "$d" ] || { echo "  (no such project — copy this template and point it at yours)"; return 3; }
  cd "$d" || return 3
  out_is_stale && step "build" bash -c 'npm run build >/tmp/re-build.log 2>&1 || { tail -20 /tmp/re-build.log; false; }'

  local port=3118
  fuser -k "$port/tcp" >/dev/null 2>&1 || true
  ( cd out && python3 -m http.server "$port" >/tmp/re-serve.log 2>&1 ) &
  local pid=$!

  local tries=0
  until curl -sf -o /dev/null "http://localhost:$port/" 2>/dev/null; do
    tries=$((tries + 1))
    [ "$tries" -gt 40 ] && { echo "  (server never came up — see /tmp/re-serve.log)"; kill "$pid" 2>/dev/null; return 3; }
    sleep 1
  done

  step "a visitor can walk the whole page" node scripts/journey.mjs --base "http://localhost:$port"
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  fuser -k "$port/tcp" >/dev/null 2>&1 || true
}

# TEMPLATE — a CLI / library. Its journey is BEHAVIOUR, not pixels.
#
# Prove the logic on synthetic fixtures AND prove it survives a real tree. A library's pieces render
# fine in the showcase and break the second time they are used.
journey_example_cli() {
  local d="$ROOT/projects/example-cli"
  [ -d "$d" ] || { echo "  (no such project — copy this template and point it at yours)"; return 3; }
  cd "$d" || return 3
  step "logic holds (self-test)"              node index.mjs --self-test
  step "it survives a real tree"              node journey.mjs
  # A checker must be proven to FAIL on bad input, not only to pass on good.
  step "a bad input is REJECTED, not accepted" bash -c '! node index.mjs bad.example.json >/dev/null 2>&1'
}

journey_skills() {
  # The reference implementations in .claude/skills are code the gates point AT, so they
  # need running as well as writing. A protection nobody executes is a protection nobody
  # has.
  cd "$ROOT" || return 3
  step "not-get-sued-101 accepts good input AND rejects bad" \
    node .claude/skills/not-get-sued-101/reference/self-test.mjs
  step "gate-protections refuse every attack they exist for" \
    node .claude/skills/gate-protections/reference/self-test.mjs
  step "correction-capture flags real corrections AND passes ordinary instructions" \
    node .claude/skills/correction-capture/scan.mjs --selftest
  step "kept-promises can actually see git history before judging it" \
    node .claude/skills/kept-promises/ledger.mjs --selftest
  step "debt-ratchet fails on growth and ratchets on shrink" \
    node .claude/skills/security-gate/debt-ratchet.mjs --selftest
  step "sdlc-chain knows a staged artifact from a missing one" \
    node .claude/skills/sdlc-chain/check.mjs --selftest
}

case "$PROJ" in
  example-web)    echo "runtime evaluation — example-web";    journey_example_web ;;
  example-static) echo "runtime evaluation — example-static"; journey_example_static ;;
  example-cli)    echo "runtime evaluation — example-cli";    journey_example_cli ;;
  skills)         echo "runtime evaluation — skills";         journey_skills ;;
  *)
    echo "usage: runtime-eval.sh <example-web|example-static|example-cli|skills|--self-test>"
    echo
    echo "The example-* journeys are TEMPLATES. Copy one, rename it for your project, point it at"
    echo "your path, and add it to this case. Add a journey_<project> function when a new project"
    echo "gains a user-facing path."
    exit 2 ;;
esac

echo
if [ "$FAILED" = "0" ]; then
  echo "RESULT: pass — $STEPS step(s), the whole journey completed."
else
  echo "RESULT: FAIL — $FAILED of $STEPS step(s) broke. The tests may still be green; the product is not."
fi
exit "$FAILED"
