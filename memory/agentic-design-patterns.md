# The five agentic design patterns — and where each one already lives in this repo

Source: a reel the owner sent, "Basic Agents vs Agents to Get You Hired (AI Engineer)". Its thesis is
that demos and production agents differ by five patterns. Transcribed rather than guessed at (the
captions are one-word fragments), then audited against what is actually in this repo.

**The audit's honest result: four of the five predate the reel, and the fifth was built the day
before it arrived.** This file exists to record where they live and where the real gap is — not to
claim a new capability.

---

## 1. Tool use / function calling

*"If your agent doesn't call tools, it's basically just a chatbot."*

Present throughout. The interesting instance is not that tools are called but **which tool is
reached for**: `execute.md` fixes a preference order (an MCP server, then Bash, then the browser
tool, then computer use) and the tool library forbids reaching outside it. The failure this prevents
is not "no tools" — it is a capable agent picking the broadest, slowest tool because it was the first
one that came to mind.

## 2. Reflection — generator produces, evaluator scores, loop until it passes

Present, and in a stronger form than the reel describes. `memory/agent-graph-engineering.md` §1:
**evaluators judge the ARTIFACT, never the builder's reasoning** — `qa`, `product` and
`security-reviewer` are spawned with the spec and the built thing in fresh context, never with the
builder's transcript. A reflection loop where the evaluator can see the generator's justification
inherits its blind spots and agrees with it.

The mechanical half is the pre-push gate: `security-gate`, `system-design-gate`, `visual-qa`, a
PROJECT-LOG entry. It genuinely blocks. It blocked twice this week — once correctly for a missing log
entry, once for an undocumented `GEMINI_API_KEY`.

**UPDATE 2026-08-15 — half of this gap is now closed.** A second reel (a real agentic coding graph)
made the sharper point: every gate here READS the artifact and none of them RUN it. `security-gate`
greps, `system-design-gate` checks shape, `npm test` exercises units written by whoever wrote the bug.
`.claude/skills/agentic-coding-graph/runtime-eval.sh` now runs the actual user journey for a project
and fails loudly — 6 steps for an example agent project, 5 for memory-engine, and proven to catch a failing step
and a missing binary rather than only to pass.

**THE REMAINING GAP, still open: reflection here is not a loop.** The gate
fails, and then a human-facing turn fixes it and pushes again. Nothing re-runs the generator against
the evaluator automatically until it passes. The pattern is implemented as a *checkpoint*, not as the
closed loop the source describes, and the difference is that the iteration count is currently paid by
the operator's attention.

## 3. Planning and task decomposition

`CLAUDE.md` rule 1: plan before writing code for anything beyond a one-line edit, via plan mode or
the `Plan` agent, then break the plan into tickets tagged with dependencies, blockers and
human-in-loop before delegating. This exists because it was violated on a real build and cost rework —
the rule is scar tissue, not theory.

## 4. Orchestrator / workers with their own context windows

`memory/agent-graph-engineering.md` is entirely this pattern: agents are nodes in a graph, each
running its own loop on its own single metric, handing off through **artifacts** (commits, files, log
entries, gate stamps) rather than conversation. The reel's point about narrow roles reducing context
pollution is the same argument the graph doc makes for artifact handoffs.

Model tiering sits on top: brainstorm on Sonnet, architect on Fable, build on Sonnet (greenfield) or
Opus (existing codebase).

## 5. Memory and context management

*"Managing what's inside the context window becomes the actual engineering problem."*

Built as `projects/memory-engine` the day before this reel arrived, from a different reel: a BM25
index over 1,540 passages of docs and past session transcripts, a 79-node knowledge graph, and a
**bounded** SessionStart injection. The measured number is the whole point — the hook used to inject
98,920 characters into every session regardless of topic; it now injects 19,774, selected by what the
session is actually about.

---

## Why this file matters beyond tooling

The owner is applying to **Data & AI and ML engineering roles** — the J.P. Morgan Data & AI Program,
the ML Center of Excellence internship. These five patterns are precisely what those interviews
probe, and the owner has spent this week specifying systems that implement all five: an opportunity
agent with a never-submit refusal proven by test, a recon-before-fill rule, a grounding check that
fails on invented claims, and a memory engine with a measured context budget.

**None of it is on their CV or portfolio**, and there is a real question about how it should be
described given the code was AI-written to their direction. That question is theirs to answer, not
one to quietly resolve by padding a profile — see the PROJECT-LOG entry in `projects/example-agent`.
