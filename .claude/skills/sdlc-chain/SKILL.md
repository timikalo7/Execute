---
name: sdlc-chain
description: >
  Check that a project leaves the artifact trail the AI-native SDLC calls for — an intent, a spec,
  a plan, verification, a deploy record and an incident record, each committed to git. Use when
  starting a new project, when asked whether a project was planned properly, before promoting an
  idea out of staging, and as a push-time gate. New projects must have the chain; ones built before
  it existed are grandfathered and only ever leave that list.
---

# sdlc-chain — every stage commits a file

From **Anthropic's Applied AI team, "The AI-Native SDLC playbook"** (`claude.com/blog/the-ai-native-sdlc-playbook`),
surfaced by reel `DcllA-5oW0w`.

The premise: **code is no longer the bottleneck.** Agents write it at speed, so the constraint moved
to planning, review and deployment — all still running at human speed. The mechanism: every stage
commits an artifact, each handoff is a git commit, and the chain doubles as the audit trail.

```bash
node .claude/skills/sdlc-chain/check.mjs projects/<name>
node .claude/skills/sdlc-chain/check.mjs --all
node .claude/skills/sdlc-chain/check.mjs --selftest    # 14 assertions
```

## The six stages

| stage | artifact | the question it answers |
|---|---|---|
| Plan | `intent.md` | what are we doing and why |
| Design | `spec.md` | what exactly must be true when it is done |
| Build | `plan.md` | in what order, and what depends on what |
| Test | `VERIFICATION.md` | what was actually run, and what did it output |
| Deploy | `LAUNCH-CHECKLIST.md` | what had to be true before it went out |
| Maintain | `INCIDENTS.md` | what has gone wrong since, and what new intent it produced |

**Maintain closes the loop** — monitoring produces a *new intent*, so the chain feeds itself.

## Verified against the source, because the reel got it wrong

The reel is a good summary with one real error and one omission, and both were caught by reading the
playbook rather than the video:

- It shows **five** stages (Plan / Build / Review / Deploy / Operate). The playbook has **six**:
  Plan / Design / Build / Test / Deploy / Maintain. Design and Test are exactly the stages a team
  skips under pressure, so losing them from the diagram loses the point.
- It presents a straight line ending at production. The playbook's Maintain stage **emits a new
  intent**, which is what makes it a loop rather than a pipeline.
- Its guardrail split is right and understated: **skills are advisory** (version-controlled policy
  the agent follows), **hooks are deterministic** and can *allow, ask, or block* — three outcomes,
  not the reel's two.
- Its strongest claim holds verbatim: **"The agent that wrote the code has no way to approve it."**
  Separation of duties is preserved by branch protection and a human code owner.

## Two design decisions worth keeping

**Aliases, not a rewrite.** Execute has written `Requirements.md` and `Proposed Plan.md` for months.
A checker that declares every existing project broken on day one is switched off on day two, so each
stage accepts Execute's existing filenames as aliases and reports them as aliases. The canonical
name is what new work should use.

**Both folders.** The chain is split by Execute's own convention — `potential-projects/<name>/` holds
the planning artifacts, `projects/<name>/` holds the running thing. The first version looked only in
`projects/` and reported all ten as broken. That was a false alarm caused by the checker modelling
the repo wrongly, and it was caught by opening `potential-projects/` before reporting the number.

## The ratchet

Ten projects predate the chain. Enforcing on all of them would fail every push tomorrow and the gate
would be turned off — worse than not having it. So `chain-baseline.json` grandfathers the known set:
**on the list is reported but not blocking; not on the list must be intact.** A new project cannot
skip planning, and a project whose chain becomes intact is removed permanently. The list only shrinks.

Proven both directions: an unlisted project with no `intent.md` exits **1** and is named; removing it
returns **0**.
