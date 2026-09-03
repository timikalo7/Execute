# The gauntlet loop — how an artifact earns "done"

**Not a term of art with a fixed definition.** It is a pattern name, from *running the gauntlet*: a
line of independent trials, each able to strike you down on its own. Defined precisely here so it
means the same thing next session.

> **A gauntlet loop is: the artifact must survive an ORDERED SERIES of INDEPENDENT checks, each of
> which can veto on its own, run repeatedly, where each failure's findings become the next
> iteration's brief — until it survives all of them.**

`memory/agent-graph-engineering.md` is the *horizontal* wiring: which node builds what, and what
context flows between them. This is the *vertical* spine: what the built thing has to walk through
before it counts. A graph without a gauntlet ships confident garbage; a gauntlet without a graph has
nothing to judge.

## The five properties. Drop any one and it stops being a gauntlet.

1. **Many checks, not one score.** Each targets a different failure mode. There is no average — a
   build that passes four of five has failed. Averaging is how a build that is half right and half
   catastrophic scores as "mostly fine".
2. **Ordered cheapest-first, so it fails fast.** A deterministic check that needs no network runs
   before one that needs a browser, which runs before one that needs a model's judgment. Never spend
   the expensive check on a build the cheap one would have rejected.
3. **The evaluators cannot see the builder's reasoning.** A judge given the builder's transcript
   inherits its blind spots and starts grading the argument instead of the artifact.
4. **A check that could not run is NOT CHECKED, never a pass.** The most dangerous state in a
   gauntlet is a gate that silently reports nothing.
5. **The findings are the next brief.** A gauntlet that only says pass/fail is a scoreboard. One
   that hands back a specific, actionable work list is a loop.

## Ours, concretely

`.claude/skills/visual-qa/design-loop.sh` — three legs, cheapest first:

| leg | what it catches | cost |
|---|---|---|
| 1 · ground sequence (`contact-sheet.mjs`) | the page is light where the reference is dark — the coarse shape | no key, no network |
| 2 · pixel profile (`pixel-profile.mjs`) | density, detail, colour, rhythm, band by band | a browser |
| 3 · design judge (`judge-frames.mjs` → a fresh sub-agent) | "would a designer accept this as the same family" | a whole agent |

Around it, wired into `.claude/hooks/pre-push-gate.sh` so the push itself is the gauntlet's exit:
`visual-qa` (a11y, overflow, console, baselines) · `security-gate` · `system-design-gate` ·
`debt-ratchet` · `sdlc-chain` · `runtime-eval` · the learner gate (a PROJECT-LOG entry in the same
push). And before an agent is even spawned, `subagent-briefing/lint-brief.mjs` runs the same idea
over the *brief*.

## The six ways it fails, each with the receipt

Every one of these happened on `projects/example-an example component library` between 2026-08-28 and 2026-08-29.

1. **Baseline poisoning — the gate scores against a reference that is wrong.** `design-pixels.json`
   was captured from the same partial view as the build and described a page that does not exist:
   ink 3.2% against the real 25.6%, one mid-tone crossing against seven. Everything downstream was
   measuring against a fantasy, so an all-white clone of a half-dark page passed.
   **Rule: when a gate passes something a person rejects, ask what it is comparing against BEFORE you
   touch a tolerance.**
2. **Averaging — the metric hides the failure it exists to find.** Ink and edge were collapsed to
   page-wide means, so one photographic scene and one empty one averaged to something reasonable.
   **Rule: compare band by band, and report the single worst band separately.**
3. **A gate that cannot run counts as nothing.** Leg 3 needed a vision API key, had none, and
   therefore had NEVER RUN across four iterations while the owner was repeatedly asked for a
   credential. The key was never the requirement — an evaluator that can see and has no stake was,
   and a fresh sub-agent is one.
   **Rule: before asking for a credential, check whether the capability is already in the building.**
4. **Metric/goal divergence — the gauntlet approves what a human rejects.** Iteration 7 did exactly
   what the judge asked, scaling drawn subjects from 15% to 50% of frame. Ink rose 18.5% → 23.2% and
   the judge's confidence that it was NOT the same design rose 0.86 → 0.90, because a bigger cartoon
   is more obviously a cartoon.
   **Rule: when the numbers improve and the verdict worsens, the numbers are not the goal. This is
   the single strongest argument for leg 3 existing.**
5. **Optimising the scorer.** A build agent set the hero to 190vh purely to move the page-aspect
   number, then reverted it itself. Another correctly refused a change that would have raised ink by
   trading away chroma — "moves the failure rather than fixing it".
   **Rule, in every brief: if a change makes the number better and the page worse, it is not a
   change.**
6. **Evaluator decay — the gauntlet is widened until nothing can fail it.** One debt pile was raised
   five times in a single session (56 → 57 → 62 → 67 → 69), every raise individually justified. The
   sixth was the point to ask what it measured: it was counting the gates' OWN vocabulary, because a
   gate branch that refuses to fake a pass prints "NOT CHECKED" and a lint rule is named
   "unverified". It grew fastest when reporting was most honest. Fixing what it counted dropped it
   to 44 — tighter than before any of the raises.
   **Rule: never widen a gate to make a push pass. If you raise a budget, do it in its own commit
   with the reason, and treat the third raise of one pile as evidence the gate is measuring the
   wrong thing.**

## Check the checker

A gate nobody checks is a rumour. `security-gate` ran for an unknown length of time with two rules
firing on code doing nothing of the kind — `insecure-http` on every `createElementNS('http://www.w3.org/2000/svg')`
in the repo, `eval-usage` on Playwright's `page.$eval` (`\b` sits happily between `$` and `e`) —
because it had **no selftest at all**. Worse, scanning a new project auto-baselined those false
positives as accepted debt, which would have buried real findings underneath them.

**Every rule gets asserted in BOTH directions: a line it must catch, and a line it must ignore.** A
rule proven only to pass has not been shown to work; a rule proven only to fire is noise with a
severity attached. This is not theoretical — writing `lint-brief.mjs` produced a rule whose regex
(`\b600000\b`) failed to match `600000ms`, and only the must-pass fixture caught it before it would
have failed every correct brief.

## Where a gauntlet ends

It ends when the artifact survives every leg — or when a leg's finding is shown to be **unreachable
from here**, in which case it is reclassified as an accepted difference, recorded with the reason,
and stopped rather than ground against. On an example component library that was the imagery: three judge runs named
the same photographic gap, generative credits stood at 0.65, and free stock structurally cannot
supply unbranded shipping containers because every real container carries an owner prefix. The target
was restated as structural and typographic parity, which is reachable.

**A loop with no reachable exit is not a gauntlet, it is a treadmill.** Say which one you are on.
