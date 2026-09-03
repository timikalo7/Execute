---
name: subagent-briefing
description: Write the brief BEFORE spawning any build sub-agent, and lint it first. Load whenever you are about to call the Agent tool for implementation work, delegate a ticket, or re-brief an agent that came back wrong. Carries the register of prompt defects this repo has actually paid for, so each brief starts from the last one's failures instead of from memory.
---

# subagent-briefing — the brief is the artifact, so version it like one

A sub-agent re-run costs a whole agent's tokens. `mcp-and-prompt-craft` says make the first call the
good one; this is that rule applied to the Agent tool, with a register of what has actually gone
wrong here and a linter that checks a brief before it is sent.

**Why this exists.** Five build briefs were written in one session, each from scratch, each from
instinct. They were long and careful and they did not compound: a defect found in brief 3 was fixed
by messaging that agent, not by fixing the brief, so brief 4 shipped the same defect. That is
prompting. It is not meta-prompting, and the difference is measured in the register below.

## The register — prompt defects this repo has paid for

Read this before writing. Each row is a real cost, not a hypothetical.

| defect | what happened | the clause that prevents it |
|---|---|---|
| No instruction on how to run long checks | An agent invented a "spawn a monitor and wait" pattern and hung in a wait loop across five notifications — **371,672 tokens, 196 tool calls** — and had to be killed | "Run every check SYNCHRONOUSLY in the foreground and read its output. Do not spawn a monitor, a watcher, or a background task and wait on it." |
| That clause **on its own**, with no timeout budget | A brief carrying the clause above produced the same wait-loop anyway. The agent's own account: the check "exceeded the 120s foreground default and was moved to background by the harness". The instruction was impossible to follow as written, so it improvised | "Give any check that runs longer than two minutes an explicit timeout of up to 600000ms." Telling an agent to do the impossible is worse than saying nothing — it improvises, and you own the result |
| An undefined metric word | "Add density" was read as row count: a partner grid went 5+4 to 15+15 and an FAQ 4 to 8 items. The measured ink coverage went DOWN | Define every metric operationally, in the units the checker uses, with the current and target numbers. |
| Commit urgency assumed | Three agents were killed by a session limit holding uncommitted trees; the work was only recovered because the parent stashed it | "COMMIT per green unit. The container is reset between turns and an uncommitted tree can simply vanish." |
| No anti-gaming clause | An agent set a hero to 190vh purely to move a page-aspect number, then reverted it itself | "If a change would make the number better and the page worse, it is not a change. Never edit a check or its tolerances." |
| Scope fences written ad hoc | Parallel agents were each told what not to touch, but the first was never told what the others would do | State the full parallel plan: which agents exist, what each owns, what this one must not touch. |
| No evidence contract | Agents reported success in prose with nothing runnable behind it | "Paste the real command output for each check. A claim with no command output is not accepted." |
| An evaluator's finding relayed without checking it | THREE iterations lost. "Cut the micro-label clutter" produced screens with zero type where the reference uses one tracked label. "Restore the dark closing CTA" chased a CTA that was already there — the judge's frames had stepped over it. "The reference is near-monochrome" was contradicted by the reference's own stills, where the aerial ship frame is the page's most saturated screen | Check every finding against ground truth BEFORE it goes in a brief, and cite the evidence by path so the builder can check it too. **A judge is an evaluator, not an oracle** |
| Verdicts relayed without the constraint | A design judge recommended using real carrier trademarks; an agent could have acted on it | When relaying an evaluator's findings, mark any finding the agent must NOT act on, and say why. |

## The brief's required parts

1. **Working directory, stack, and what to read first** — CLAUDE.md, the project README, the
   relevant `docs/`, the last PROJECT-LOG entry (so it inherits the last iteration's lessons).
2. **One job, sharp scope.** The ticket, the exact files, and — when agents run in parallel —
   what the others own and this one must not touch.
3. **Ground truth it cannot derive.** Point at reference images, spec files, measured numbers.
   Point to paths; do not paste dumps.
4. **Operational definitions.** Any word the checker measures (density, contrast, fidelity, detail)
   gets defined in the checker's own units, with current and target values.
5. **Definition of done** — the exact commands that must pass, run synchronously.
6. **The anti-gaming clause.**
7. **Commit discipline** — per green unit, do not push, PROJECT-LOG entry.
8. **The evidence contract** — what to paste back, and that unverified parts must be named.

## Before spawning

    node .claude/skills/subagent-briefing/lint-brief.mjs <brief.txt>

It fails on a brief missing a clause the register says is load-bearing. Fix the brief, not the
linter. When an agent comes back wrong for a reason the brief could have prevented, add the row to
the register and the clause to the linter in the same commit — that is the whole point of the file.
