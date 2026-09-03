---
name: discovery-interrogation
description: >
  Grill the owner before producing a plan, so the plan is built on their actual intent instead of
  Execute's assumptions. Use at the start of /kickoff (before research), and before any non-trivial
  /add-feature, /improve, or redesign. Runs the vendored `grilling` method (one question at a time,
  each with a recommended answer) and writes Discovery.md, which research/viability/plan/build agents
  then read.
---

# discovery-interrogation — grill first, plan second

**The interrogation method is the `grilling` skill** (vendored from mattpocock/skills, MIT). Load it
and follow it exactly. This file supplies only the Execute-specific parts: *what* to ask about, and
*what artifact* the session must produce.

**Why:** a plan built on assumptions gets rejected at the approval gate and burns a research pass.
The owner has the context; Execute has to extract it, not guess it.

## The method (from `grilling` — do not water it down)
- **One question at a time.** Wait for the answer before the next one. Asking several at once is
  bewildering. You may render the single question as an `AskUserQuestion` with 2–4 concrete options
  (recommended first) — clicking beats typing for this owner — but it is still **one** question.
- **Always give your recommended answer** with the question. "What do you think?" is lazy.
- **Look facts up, don't ask them.** Anything discoverable in the repo, `memory/`, or the web is
  yours to find. Only *decisions* go to the owner.
- **Walk the decision tree**, resolving dependencies one by one — an answer that unlocks or kills
  three later questions comes first.
- **Do not start building until the owner confirms shared understanding.**

## What to grill about — pick the branches that matter for THIS idea
**Outcome & scope** — what "done" looks like for v1; the single must-do thing; throwaway experiment
vs real product vs maintained infrastructure.
**Users & value** — who it's for (you · a client/org · public users · a business to sell); what they
do today instead; the aha-moment in the first 60 seconds.
**Constraints that reshape the plan** — budget (keyless/free only · will pay for a few services ·
unconstrained); timeline (this session · this week · none); runtime surface (static site · web app
with backend · mobile · CLI · internal only).
**Gate profile** — does it touch auth, user accounts, payments, or user data? This decides whether
`security-reviewer`, the e-commerce guideline, and the data-rights ship-blockers apply.
**Data & integrations** — what data it needs, whether the owner already has access/keys, what it must
integrate with.
**Design & voice** (front-end) — reference sites/brands to feel like; existing brand assets or from
scratch.
**Risk & the not-list** — what would make this a failure even if it ships; what is explicitly out of
scope or must NOT change.

Skip any branch whose answer wouldn't change the work — decide it yourself and record it as an
assumption. Judgment calls are yours; only real forks go to the owner.

## Output — `Discovery.md` (required)
Write to `potential-projects/<name>/Discovery.md` (or the project dir for `/add-feature` `/improve`):
```markdown
# Discovery — <idea>
Date · grilled via discovery-interrogation (grilling method)

## Answers
- **<question>** → <owner's answer> (+ any note they added)

## Assumptions (not asked / unconfirmed)
- <assumption> — chosen because <reason>. Reverse this if wrong.

## What this changes about the plan
- <concrete implication, e.g. "no backend ⇒ static export, no security-gate surface, Cloudflare Pages">

## Open questions for the owner
- <anything still blocking, mirrored into the YOU DO: list>
```

## If the session can't take answers
Non-interactive run, or the owner doesn't reply: do **not** stall the whole run. Write `Discovery.md`
with every answer you'd have needed marked **ASSUMED — unconfirmed**, continue on those assumptions,
and surface them in the `YOU DO:` list so the owner can correct them in one pass.

## After discovery
Pass `Discovery.md` to the `research` agent (it scopes the market/tool scan), to `viability` (it
scores against the owner's real goal), and cite it in `Proposed Plan.md` — every choice traces to an
answer or a stated assumption. Build agents read it when a ticket is ambiguous. Discovery is an
**artifact handoff**, per `memory/agent-graph-engineering.md`.
