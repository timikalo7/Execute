#!/usr/bin/env bash
# Execute PreCompact hook — fires when Claude Code is about to compact the context
# (auto at ~the window limit, or on a manual /compact). Instead of letting a silent,
# lossy auto-summary eat the working detail, inject a HANDOFF instruction so the model
# writes itself a durable resume note first. Implements the 40–80% context-hygiene
# principle (memory/principles.md): deliberate handoff beats auto-compaction.
#
# Input on stdin: {"trigger":"auto"|"manual", ...}. Output: hookSpecificOutput.additionalContext.
read -r STDIN || true
TRIGGER="$(printf '%s' "$STDIN" | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("trigger",""))
except Exception: print("")' 2>/dev/null)"

MSG='CONTEXT COMPACTION IMMINENT — write a HANDOFF before detail is lost.
You are at/near the context limit. Auto-compaction summarizes lossily and drops exact file
paths, decisions, and in-flight state. Before you continue, write yourself a concise handoff so
the post-compaction you resumes without re-deriving anything:
  1. GOAL — what the current task is and its definition of done.
  2. DONE — what is already committed/pushed (commit SHAs, branch).
  3. NEXT — the exact next steps, in order.
  4. KEY PATHS — the files/dirs in play right now.
  5. DECISIONS / OPEN — choices already made and anything still unresolved or owner-blocked.
  6. IN-FLIGHT — any uncommitted work, running agents, or partial state to preserve first.
Prefer this deliberate handoff over trusting the auto-summary. After writing it, compaction
may proceed. (Execute context-hygiene rule: stay in the 40–80% band; hand off near 80%.)'

printf '{"hookSpecificOutput":{"hookEventName":"PreCompact","additionalContext":%s},"systemMessage":"Context near limit (%s compact) — writing a handoff before compaction (Execute context-hygiene)."}\n' \
  "$(printf '%s' "$MSG" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" \
  "${TRIGGER:-auto}"
