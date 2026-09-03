---
name: agentic-coding-graph
description: Design a build as a GRAPH of agent threads with goal contracts fixed upfront and an ordered evaluation chain — plan → parallel module workers → runtime evaluation that actually RUNS the artifact → scale/edge review → independent review → package. Use when a build is large enough to need more than one worker, when a build must run unattended, or when tests are green and the product is still broken. Ships a runnable runtime-eval harness.
---

# Agentic coding graph

A build laid out as a graph of threads, with every worker's contract written **before** any of them
start, and an evaluation chain that ends in something a person could actually use.

Source: a breakdown of a real run — a cross-harness memory tool built by a graph of Codex threads
while its author was out of the house. Transcribed and audited against this repo, which already had
most of the structure and was missing one specific thing.

## The shape

```
    requirements + /goal contracts          ← written first, by a human, before any worker starts
                  │
            planning thread                 ← decides HOW MANY workers and what each one's contract is
                  │
   ┌──────────┬───┴───┬──────────┐
 worker     worker  worker     worker       ← one module each, own context window
   └──────────┴───┬───┴──────────┘
                  │
      RUNTIME EVALUATION THREAD             ← DEPLOYS AND RUNS IT. Not unit tests.
                  │
      scale / edge case / efficiency        ← a second evaluator, different question
                  │
        independent review thread           ← fresh context, sees only the artifact
                  │
             package thread
```

## What this repo already had

Four of these were already law here and are not re-litigated: **goal contracts** (`CLAUDE.md`'s
tickets tagged with dependencies, blockers and human-in-loop), **parallel workers with their own
context** and **artifact handoffs** (`memory/agent-graph-engineering.md`), and **an evaluator that
judges the artifact rather than the builder's reasoning**.

## The one thing it was missing, and now has

**Every gate in this repo READS the artifact. None of them RUN it.**

`security-gate` greps it. `system-design-gate` checks its shape. `npm test` exercises its units — and
unit tests are written by whoever wrote the bug, so they encode the same assumptions. A project can be
entirely green and broken the moment someone opens it. That is exactly what happened with the form
filler: five real bugs, all invisible to fixtures, all found the moment it was pointed at a real form.

So the first evaluator in the chain **runs the user's actual journey**:

```bash
bash .claude/skills/agentic-coding-graph/runtime-eval.sh an example agent project
bash .claude/skills/agentic-coding-graph/runtime-eval.sh --self-test
```

Measured, on the real projects:

```
runtime evaluation — an example agent project
  discovery reaches its sources                  ok
  eligibility rules load and self-test           ok
  documents generate                             ok
  the dashboard rebuilds                         ok
  a generated pack is grounded                   ok
  the filler refuses to submit                   ok
RESULT: pass — 6 step(s), the whole journey completed.
```

And the harness is proven to fail, not merely to pass — `--self-test` asserts it reports a failing
step as failed, reports a missing binary as failed, and does not cry wolf on a good one. A gate that
has only ever been seen to pass is not a gate.

**Its journeys are deliberately not the test suite.** If the two ever agree completely, one of them is
redundant. `runtime-eval` runs what a person does: discover, generate, open the dashboard, check a
pack is grounded. Add a `journey_<project>` function when a project gains a user-facing path.

## How to use it on a real build

1. **Write the goal contract first, per module.** What it owns, what it must not touch, what "done"
   means as something observable. Vague contracts are how two workers write the same file.
2. **Plan the graph before spawning anything.** How many workers, which modules, what each one's
   contract is — the planning thread's only output.
3. **Spawn workers with the contract and nothing else.** No transcripts, no other worker's reasoning.
4. **Run `runtime-eval` before any review.** Reviewing code that does not run is reviewing fiction.
5. **Then the second evaluator, asking a different question** — scale, edge cases, efficiency. Same
   evaluator asking twice is one evaluator.
6. **Then independent review in fresh context**, seeing only the artifact.
7. **Then package.**

## The honest caveat

The source ran this unattended and got a usable product. **That is their claim, not a measurement made
here** — no run of this graph shape has been executed end to end in this repo. What has been measured
is `runtime-eval` itself, on three real projects, in both directions. Treat the rest of the shape as a
design worth following, not a proven yield.

The gap it does not close is still open and is recorded in `memory/agentic-design-patterns.md`:
**reflection here is a checkpoint, not a loop.** `runtime-eval` fails loudly; nothing yet re-runs the
worker against it until it passes.
