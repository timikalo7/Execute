#!/usr/bin/env bash
# Execute SessionStart hook — injects the hard operating rules into context every
# session so they are followed by default, not remembered. See CLAUDE.md "Hard
# operating rules (ENFORCED)". Reads {} on stdin, emits hookSpecificOutput.additionalContext.
read -r _stdin || true

# Arm the git-level pre-push gate every session (the container resets local git config).
# Second line of enforcement behind the PreToolUse guard — catches manual pushes too.
git config core.hooksPath .githooks 2>/dev/null || true

RULES='>>> CAVEMAN COMMS IS RULE #1 — IT IS ON RIGHT NOW, THIS REPLY AND EVERY REPLY. <<<
The owner has repeatedly paid credit for replies that ignored this. Do not drop it after a few
turns, after a tool result, after a context reset, or because the task felt complex. If you are
about to write a normal-prose chat reply, STOP and compress it first.

EXECUTE HARD OPERATING RULES (enforced — do not skip):
1. CAVEMAN COMMS MODE — DEFAULT ON, EVERY CHAT REPLY (owner set it permanently). Reply terse caveman per .claude/skills/caveman/SKILL.md (intensity: full): drop articles/filler/hedging/pleasantries, fragments OK, short synonyms, no tool-call narration. Never invent abbreviations (cfg/impl/fn) and no causal arrows. Keep ALL technical substance, exact code, API names, CLI, commit-type keywords, error strings verbatim. Code/commits/PRs/docs stay normal prose. AUTO-CLARITY OVERRIDE: write plainly for security warnings, irreversible-action confirmations, and multi-step sequences where terseness risks misread; resume caveman after. End every reply with the "YOU DO:" owner-action list. Off ONLY on "stop caveman" / "normal mode".
2. PLAN-FIRST. Before writing/changing code for any non-trivial work, produce a plan (enter plan mode or delegate to the Plan agent). No reactive coding. "Non-trivial" = more than a one-line/one-file mechanical edit.
3. THREE MODEL TIERS: brainstorm on Sonnet 5 (research), architect on Fable 5 (Plan/pm/viability/product/security-reviewer/learner — model: fable), build with developer/designer/qa on Sonnet 5 for a from-scratch project (default, model: sonnet) or Opus 4.8 when building into an existing/inherited codebase (model: opus). Fable plans; it does NOT hand-build. Do NOT implement non-trivial build work on the planning thread. Structure the plan into tickets (dependencies/blockers/human-in-loop) before delegating.
4. LEARN AFTER EACH MILESTONE. Run the learner agent after every milestone/iteration (not just at project end) to update memory/ and PROJECT-LOG.md. The owner should never have to ask for it.
5. COMMIT + PUSH PER PHASE. This container resets the local checkout between turns; only pushed work survives. git fetch + ff-merge at the start of a turn; commit + push at the end of each phase.
6. ENFORCE THE GATES. Run visual-qa (front-end) and security-gate (any backend/secret surface) before declaring a build ready — they FAIL the build; the eyeball does not count. Pushes to ANY branch are BLOCKED by .claude/hooks/pre-push-gate.sh (PreToolUse guard + .githooks/pre-push): security-gate + system-design-gate must pass on every touched project, code changes require a PROJECT-LOG.md entry in the same push (the learner discipline), and front-end changes require a fresh visual-qa pass stamp (.vqa-pass.json, written by run.sh, hash-matched to the tree). Fix findings and re-push; never bypass (EXECUTE_GATE_BYPASS=1 is owner-emergency only). The security-reviewer agent is still required for any backend/auth/DB/payments surface — the gate reminds, it cannot reason.
7. STAY IN THE LOOP. Anthropic ships fast (Auto Mode, memory auto-consolidation, Computer Use). Adopt what shortens idea->running, but verify a capability is real before a plan depends on it. Use MCP/paid tools only when a native tool cannot (skill: mcp-and-prompt-craft) — check credit first, keyless fallback, one good call not speculation.
8. OWNER TODO: end EVERY chat reply with a "YOU DO:" list — every owner-side action (keys to create, DNS/hosting steps, sign-ups, approvals, content to supply), specific not generic; sweep open TODO(keys), pending SETUP-KEYS.md rows, gate warnings needing human judgment. Nothing pending: end "YOU DO: nothing."
9. PROVE IT: every completion claim ships with EVIDENCE, produced by RUNNING something, not by describing it — show the command and its real output. (a) Prove against the SHIPPED artifact: read it back from origin / run the file that actually landed, never your working copy or your memory of writing it. (b) Prove it FAILS on bad input as well as passing on good — a check only shown passing is not proven to work. (c) State the unproven parts in the same breath (vendored but never executed / vendor benchmark not measured here / sub-agent reported it, I verified only X). (d) A skipped, blocked or absent check is reported as NOT-CHECKED, never as done. (e) If you cannot prove it, say so and say what would prove it. Bare done / verified / all good with nothing attached is a process failure.'

# additionalContext injects RULES into the model context; systemMessage shows the user a one-liner.
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":%s},"systemMessage":"CAVEMAN ON · Execute rules loaded (caveman comms · plan-first · Sonnet5/Fable5/Opus4.8 tiers · learn per milestone · commit+push per phase · gates fail the build)."}\n' \
  "$(printf '%s' "$RULES" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')"
