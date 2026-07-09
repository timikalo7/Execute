#!/bin/bash
# Execute SessionStart hook: inject the persistent brain into every session.
#
# CLAUDE.md says load memory at /kickoff and /approve — but tasks outside those
# gates ran cold and repeated documented mistakes (e.g. the pkill exit-144 trap
# that was already in tool-notes.md). This makes "load memory before acting"
# STRUCTURAL: principles.md + tool-notes.md + user-profile.md are emitted to
# stdout, which Claude Code adds to the session context at start.
#
# Synchronous + read-only (just cats files): no deps, idempotent, fast.
set -euo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
MEM="$ROOT/memory"

emit() { # $1 = file, $2 = heading
  [ -f "$1" ] || return 0
  echo "## $2"
  echo
  cat "$1"
  echo
}

echo "# Execute memory — auto-loaded at session start"
echo
echo "Read and APPLY this before acting (not only at /kickoff and /approve)."
echo "Canonical files: memory/principles.md, memory/tool-notes.md, memory/user-profile.md."
echo
emit "$MEM/principles.md"  "Principles (durable lessons)"
emit "$MEM/tool-notes.md"  "Tool notes (what worked / what bit us)"
emit "$MEM/user-profile.md" "User profile (owner model)"
