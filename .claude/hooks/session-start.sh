#!/bin/bash
# Execute SessionStart hook: inject the persistent brain into every session — the RELEVANT part of it.
#
# What this used to do: `cat` principles.md + tool-notes.md + user-profile.md in full. That is 98,920
# characters injected into every session regardless of what the session is about, and it is the exact
# failure mode described in the agent-memory breakdown the owner sent: memory that is always present
# is not memory, it is a preamble. A preamble that size crowds out the context the actual task needs,
# and the parts that matter get skimmed alongside the 90% that does not apply.
#
# What it does now:
#   - user-profile.md IN FULL. It is 13KB, it is the owner model, and it applies to every session.
#     There is no version of "who am I working for" that is irrelevant.
#   - principles.md and tool-notes.md through memory-engine, matched to what this session is plausibly
#     about — the branch name, the last few commit subjects, and the files currently modified. At
#     SessionStart there is no user prompt yet, so that is the best available signal for the topic,
#     and it is a good one: a session almost always continues the work the branch is already doing.
#
# Falls back to the old full-cat if the index has not been built. A hook that silently emits nothing
# because a helper is missing is worse than one that emits too much.
#
# Synchronous, read-only, no deps beyond node + git.
set -euo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
MEM="$ROOT/memory"
ENGINE="$ROOT/projects/memory-engine/memory.mjs"
INDEX="$ROOT/projects/memory-engine/.store/index.json"

echo "# Execute memory — auto-loaded at session start"
echo
echo "Read and APPLY this before acting (not only at /kickoff and /approve)."
# List only the memory files that actually exist — corrections.md and the memory engine are both
# optional, and pointing a session at a file that is not there is an instruction it cannot follow.
CANON="memory/principles.md, memory/tool-notes.md, memory/user-profile.md"
[ -f "$MEM/corrections.md" ] && CANON="$CANON, memory/corrections.md"
echo "Canonical files: $CANON."
[ -f "$ENGINE" ] && echo "Ask for more with: node projects/memory-engine/memory.mjs recall \"<question>\""
echo

# The owner model, always and in full.
if [ -f "$MEM/user-profile.md" ]; then
  echo "## User profile (owner model)"
  echo
  cat "$MEM/user-profile.md"
  echo
fi

# Corrections — the rulings the owner has already made. Cheap, and re-litigating one is itself
# the error this file exists to stop.
if [ -f "$MEM/corrections.md" ]; then
  echo "## Corrections (what the owner has already ruled on — do not re-litigate)"
  echo
  cat "$MEM/corrections.md"
  echo
fi

# What is this session probably about? Branch, recent subjects, dirty files.
CONTEXT=""
if git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  CONTEXT="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || true) \
$(git -C "$ROOT" log -8 --format=%s 2>/dev/null || true) \
$(git -C "$ROOT" status --porcelain 2>/dev/null | head -30 | awk '{print $NF}' || true)"
fi

# SELF-HEALING INDEX.
#
# .store/ is gitignored — deliberately, it contains past session text — so a fresh clone, a new
# machine or a rebuilt container always starts without an index. Asking a human to remember a build
# step in that situation is asking them to hit the degraded path forever, so this rebuilds it itself.
#
# In the BACKGROUND, always. The hook has a 10-second budget and indexing grows with the transcript
# history; a hook that occasionally times out is a hook that occasionally injects nothing. So this
# session uses whatever index exists right now (or the fallback below), and the rebuild lands for the
# next one. Rebuild when the index is missing, older than 12 hours, or older than any of its sources.
if command -v node >/dev/null 2>&1 && [ -f "$ENGINE" ]; then
  NEEDS_BUILD=0
  if [ ! -f "$INDEX" ]; then
    NEEDS_BUILD=1
  elif [ -n "$(find "$INDEX" -mmin +720 2>/dev/null)" ]; then
    NEEDS_BUILD=1
  elif [ -n "$(find "$MEM" "$ROOT/.claude/skills" -name '*.md' -newer "$INDEX" -print -quit 2>/dev/null)" ]; then
    NEEDS_BUILD=1
  fi
  if [ "$NEEDS_BUILD" = "1" ]; then
    ( cd "$ROOT/projects/memory-engine" && nohup node memory.mjs index >/dev/null 2>&1 & ) >/dev/null 2>&1 || true
  fi
fi

if [ -f "$INDEX" ] && command -v node >/dev/null 2>&1; then
  OUT="$(node "$ENGINE" hook "$CONTEXT" 2>/dev/null || true)"
  if [ -n "$OUT" ]; then
    echo "$OUT"
    echo
    echo "_(Matched to this session from ${ROOT##*/}'s memory store. The full files are still on disk;"
    echo "run \`node projects/memory-engine/memory.mjs recall \"…\"\` for anything not shown.)_"
    exit 0
  fi
fi

# Fallback: no index, or nothing matched. Emit the lot rather than nothing.
emit() {
  [ -f "$1" ] || return 0
  echo "## $2"
  echo
  cat "$1"
  echo
}
emit "$MEM/principles.md" "Principles (durable lessons)"
emit "$MEM/tool-notes.md" "Tool notes (what worked / what bit us)"
