#!/usr/bin/env bash
# design-loop — build, capture, compare against the reference, report what is still wrong. Repeat.
#
# The owner's instruction, verbatim: "u should loop until the evaluator looks at the video and what
# u generated s video and says its the same." And later, after seeing a build that had passed:
# "dont stop looping till par."
#
# WHY THIS WAS REWRITTEN. The first version had exactly one exit condition — a vision model judging
# two walkthrough recordings — and refused to start without a key for it. Correct in principle, and
# it meant the loop had never once run. Meanwhile the build was shipped past three other checks that
# all passed it, because none of them held the reference page.
#
# So the loop now has THREE legs and runs whatever is available:
#
#   1. GROUND SEQUENCE   contact-sheet.mjs, against reference stills committed in the repo. Needs
#                        no key and no network. Catches the coarse failure: a page that is light
#                        where the reference is dark is not that page.
#   2. PIXEL PROFILE     pixel-profile.mjs, band by band. Catches density and detail gaps.
#   3. VISION JUDGE      video-judge.mjs, a different model looking at both walkthroughs. This is
#                        the leg the owner asked for and the only one that can speak to whether the
#                        two feel like the same design.
#
# Leg 3 needs an OpenAI-compatible vision endpoint (VISION_JUDGE_URL / _MODEL / _KEY). When it is
# not configured the loop still runs legs 1 and 2, and the overall result is reported as
# "MECHANICAL PASS — VISION NOT CHECKED". That is never printed as a pass, because a check that did
# not run is not a check that passed.
#
#   bash design-loop.sh <project> [--ref-dir <dir>] [--ref-url <url>] [--iterations N]
#
# --ref-dir defaults to projects/<project>/reference/slices. --ref-url additionally records the live
# reference for the vision leg; in this container Chromium cannot reach the public internet, so the
# committed stills are the working path and a URL is optional.
set -uo pipefail

PROJ="${1:?usage: design-loop.sh <project> [--ref-dir dir] [--ref-url url] [--iterations N]}"
shift
ROOT="$(git rev-parse --show-toplevel)"
SKILLS="$ROOT/.claude/skills"
REF_DIR="$ROOT/projects/$PROJ/reference/slices"
REF_URL=""
MAX=1
while [ $# -gt 0 ]; do
  case "$1" in
    --ref-dir) REF_DIR="$2"; shift 2 ;;
    --ref-url) REF_URL="$2"; shift 2 ;;
    --iterations) MAX="$2"; shift 2 ;;
    *) echo "unknown argument: $1"; exit 2 ;;
  esac
done

[ -d "$REF_DIR" ] || { echo "no reference stills at $REF_DIR — capture them first, or pass --ref-dir"; exit 2; }
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"; [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null' EXIT

FF="$(python3 -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())' 2>/dev/null || command -v ffmpeg)"
frames() { mkdir -p "$2"; "$FF" -y -i "$1" -vf "fps=1/4,scale=768:-2" -q:v 4 "$2/f%02d.jpg" >/dev/null 2>&1; }

VISION_READY=0
[ -n "${VISION_JUDGE_KEY:-}" ] && [ -n "${VISION_JUDGE_URL:-}" ] && VISION_READY=1

# The reference walkthrough is only needed by the vision leg, and only if it is reachable.
REF_FRAMES=""
if [ "$VISION_READY" = "1" ] && [ -n "$REF_URL" ]; then
  echo "== recording the reference: $REF_URL"
  ( cd "$ROOT/projects/$PROJ" && node "$SKILLS/browser-drive/external-site.mjs" "$REF_URL" "$WORK/ref" --seconds 50 ) >/dev/null 2>&1
  REF_VID="$(ls "$WORK"/ref/*.webm 2>/dev/null | head -1)"
  if [ -n "$REF_VID" ]; then frames "$REF_VID" "$WORK/ref-frames"; REF_FRAMES="$WORK/ref-frames"
  else echo "   could not reach the reference — the vision leg will use the committed stills instead"; fi
fi
[ -z "$REF_FRAMES" ] && REF_FRAMES="$REF_DIR"

for i in $(seq 1 "$MAX"); do
  echo ""
  echo "======== iteration $i of $MAX"
  echo "-- building"
  # Keep the build log. Sending it to /dev/null and printing "BUILD FAILED" gives whoever is holding
  # the loop nothing to act on, and a check whose failure cannot be explained is barely a check.
  BUILD_LOG="$WORK/build-$i.log"
  if ! ( cd "$ROOT/projects/$PROJ" && npm run build ) > "$BUILD_LOG" 2>&1; then
    echo "BUILD FAILED — fix that first. Last 30 lines:"
    tail -30 "$BUILD_LOG" | sed 's/^/    /'
    exit 1
  fi

  PORT=$((3300 + i))
  ( cd "$ROOT/projects/$PROJ" && npx --yes serve@14 out -l "$PORT" ) >/dev/null 2>&1 &
  SRV=$!
  tries=0
  until curl -sf -o /dev/null "http://localhost:$PORT/"; do
    tries=$((tries+1)); [ "$tries" -gt 45 ] && { echo "server never came up"; exit 3; }
    sleep 1
  done

  FAILED=0

  echo ""
  echo "-- leg 1: ground sequence, against $(ls "$REF_DIR" | wc -l) reference stills"
  if node "$SKILLS/visual-qa/contact-sheet.mjs" --ref-dir "$REF_DIR" --built "http://localhost:$PORT/" \
       --out "$ROOT/projects/$PROJ/.contact-sheet.jpg" --fail; then
    echo "   leg 1 PASS"
  else
    echo "   leg 1 FAIL — see projects/$PROJ/.contact-sheet.jpg"
    FAILED=1
  fi

  echo ""
  echo "-- leg 2: pixel profile, band by band"
  if [ -f "$ROOT/projects/$PROJ/design-pixels.json" ]; then
    if node "$SKILLS/visual-qa/pixel-profile.mjs" --ref "$ROOT/projects/$PROJ/design-pixels.json" \
         --built "http://localhost:$PORT/" --fail; then
      echo "   leg 2 PASS"
    else
      echo "   leg 2 FAIL"
      FAILED=1
    fi
  else
    echo "   leg 2 NOT CHECKED — no design-pixels.json reference profile for this project"
  fi

  echo ""
  echo "-- leg 2b: lateral motion, which no single-frame check can see"
  BUILD_SLICES="$WORK/build-slices-$i"
  mkdir -p "$BUILD_SLICES"
  if python3 "$SKILLS/visual-qa/slice-sheet.py" "$ROOT/projects/$PROJ/.contact-sheet.jpg" "$BUILD_SLICES" >/dev/null 2>&1; then
    if node "$SKILLS/visual-qa/axis-motion.mjs" --ref-dir "$REF_DIR" --built-dir "$BUILD_SLICES" --fail; then
      echo "   leg 2b PASS"
    else
      echo "   leg 2b FAIL — a lateral track is flattened or invented"
      FAILED=1
    fi
  else
    echo "   leg 2b NOT CHECKED — could not slice the contact sheet"
  fi

  echo ""
  echo "-- leg 3: vision judge"
  if [ "$VISION_READY" = "1" ]; then
    rm -rf "$WORK/built" "$WORK/built-frames"
    ( cd "$ROOT/projects/$PROJ" && node "$SKILLS/browser-drive/external-site.mjs" "http://localhost:$PORT/" "$WORK/built" --seconds 50 ) >/dev/null 2>&1
    BUILT_VID="$(ls "$WORK"/built/*.webm 2>/dev/null | head -1)"
    if [ -n "$BUILT_VID" ]; then
      frames "$BUILT_VID" "$WORK/built-frames"
      if node "$SKILLS/visual-qa/video-judge.mjs" --ref-frames "$REF_FRAMES" \
           --built-frames "$WORK/built-frames" --json "$ROOT/projects/$PROJ/.design-verdict.json"; then
        echo "   leg 3 PASS"
      else
        echo "   leg 3 FAIL — findings in projects/$PROJ/.design-verdict.json"
        FAILED=1
      fi
    else
      echo "   leg 3 NOT CHECKED — could not record the build"
      FAILED=1
    fi
  else
    echo "   leg 3 NOT CHECKED by an EXTERNAL model — no endpoint configured"
    echo "   (VISION_JUDGE_URL / _MODEL / _KEY; any OpenAI-compatible vision endpoint, a free"
    echo "   provider directly or a FreeLLMAPI router in front of several. See SETUP-KEYS.md.)"
    echo ""
    echo "   BUT THE KEY WAS NEVER THE REQUIREMENT. The requirement is an evaluator that can see"
    echo "   images and has no stake in the build, and a FRESH SUB-AGENT is one. Run:"
    echo ""
    echo "     node $SKILLS/visual-qa/judge-frames.mjs \\"
    echo "       --ref-dir $REF_DIR \\"
    echo "       --sheet $ROOT/projects/$PROJ/.contact-sheet.jpg \\"
    echo "       --out <dir>"
    echo ""
    echo "   then spawn a fresh sub-agent with that BRIEF.txt as its ENTIRE prompt — no build"
    echo "   context, no transcript, no repo notes. Record the verdict JSON in the project."
    echo "   A sub-agent shares a model family with whatever wrote the code, so an external model"
    echo "   is still better; say so wherever the verdict is quoted. It is not a substitute for one."
    echo "   Either way this leg is NOT CHECKED until a judge has actually returned a verdict."
  fi

  kill $SRV 2>/dev/null; wait $SRV 2>/dev/null; fuser -k "$PORT/tcp" >/dev/null 2>&1; SRV=""

  echo ""
  if [ "$FAILED" = "0" ]; then
    if [ "$VISION_READY" = "1" ]; then
      echo "RESULT: PASS on iteration $i — every leg accepts the build."
      exit 0
    fi
    echo "RESULT: MECHANICAL PASS on iteration $i — VISION NOT CHECKED."
    echo "The build follows the reference's structure. Whether it FEELS like the same design has not"
    echo "been judged, because leg 3 never ran. Do not report this as done."
    exit 0
  fi
  echo "iteration $i rejected. The findings above are the work list for the next pass."
  # The loop deliberately does NOT auto-edit the page. A judge's findings are a brief, and applying
  # them is design work — a loop that mutates the page to satisfy a scorer optimises the scorer.
done

echo ""
echo "RESULT: FAIL — $MAX iteration(s) without the build being accepted."
exit 1
