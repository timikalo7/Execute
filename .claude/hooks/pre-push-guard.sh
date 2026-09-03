#!/usr/bin/env bash
# PreToolUse guard — intercepts Bash `git push` calls and runs the Execute pre-push gate first.
# Non-push commands pass through instantly. Exit 2 blocks the tool call and feeds the gate's
# output back to the model so it can fix and retry. Pairs with .githooks/pre-push (manual pushes).
set -u
IN="$(cat)"
CMD="$(printf '%s' "$IN" | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("tool_input",{}).get("command",""))
except Exception: print("")' 2>/dev/null)"

# Strip heredoc bodies and quoted strings first: doc text like "then git push again" inside a
# heredoc/echo is NOT a push (a heredoc that mentioned push triggered a full gate run, 2026-07-07).
STRIPPED="$(printf '%s' "$CMD" | python3 -c '
import re, sys
c = sys.stdin.read()
c = re.sub(r"<<-?\s*.?(\w+).?[\s\S]*?\n\1\b", " <<HEREDOC>> ", c)          # heredoc bodies
c = re.sub(r"\x27[^\x27]*\x27", " <<SQ>> ", c)                              # single-quoted
c = re.sub(r"\"(?:[^\"\\\\]|\\\\.)*\"", " <<DQ>> ", c)                      # double-quoted
print(c)' 2>/dev/null || printf '%s' "$CMD")"

# a real git-push invocation (start of command or after a separator), not the words in a string.
# One optional WRAPPER token is allowed before `git` (e.g. `rtk git push`, `time git push`,
# `command git push`, `nice git push`). RTK — the token-compression proxy — rewrites `git push`
# into `rtk git push` via its own PreToolUse hook; without this allowance the wrapped form would
# slip past the guard and the gate would silently stop firing (evaluator decay,
# memory/agent-graph-engineering.md §5). Over-matching here is the safe direction: a needless gate
# run costs seconds, a missed one ships unaudited code.
printf '%s' "$STRIPPED" | grep -qE '(^|[;&|]|&&|\|\|)[[:space:]]*([a-zA-Z0-9_.:/-]+[[:space:]]+)?git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+push\b' || exit 0

# The gate inspects the worktree/HEAD as they are NOW. If this same command also mutates git
# state before pushing, the gate judges the wrong tree (misfired on a checkout+commit+push
# one-liner, 2026-07-07) — force a split instead.
if printf '%s' "$STRIPPED" | grep -qE '(^|[;&|]|&&|\|\|)[[:space:]]*git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+(checkout|switch|commit|merge|rebase)\b'; then
  echo "pre-push guard: this command both changes git state and pushes; the gate evaluates HEAD before your changes land, so it would judge the wrong tree. Run checkout/commit/merge in their own Bash call first, then push alone." >&2
  exit 2
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
if ! bash "$HERE/pre-push-gate.sh" >&2; then
  echo "pre-push gate failed — the push was blocked. Fix the findings, commit, and push again." >&2
  exit 2
fi
exit 0
