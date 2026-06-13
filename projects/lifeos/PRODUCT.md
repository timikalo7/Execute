# Product

## Register

product

> LifeOS has two surfaces. **Product is the default** (the app/dashboard is the
> real thing; the landing exists to get people into it). The marketing landing
> may be worked in the **brand** register per-task — when you do, say so and
> hold the brand bar (distinctiveness) instead of the product bar.

## Users

Deliberate, self-directed people — the "founder-athlete" archetype: builders,
operators, and high-intent individuals who already think in systems and want
their day to reflect their identity, values, and goals rather than a reactive
inbox. Context of use: early morning, before the day starts, at a desk, often
the first screen they open. They are not looking to be entertained; they are
looking to know the single most important thing to do next, and why.

The job to be done: *"Turn who I'm trying to become into what I actually do
today."* On any given screen the primary task is to see today's ranked plan,
execute it, and keep the streak — with weekly/monthly review as the slower loop
that adjusts the system.

## Product Purpose

LifeOS compiles a person's identity, values, domains, goals, and systems into a
single executable day: a leverage-ranked task list with the reasoning behind the
order, domain balance, and streak tracking. It exists because most tools *hold*
tasks; LifeOS decides what matters. Success looks like a user who opens it each
morning, trusts the top of the list, and acts on it without re-litigating —
consistency of execution, not feature usage, is the win.

## Brand Personality

Calm, deliberate, premium, quietly authoritative — a **command deck**, not a
dopamine casino. Three words: **deliberate, grounded, sharp.** The voice is
plainspoken and confident; it shows rather than tells (the real "today" surface
is the hero, not a glow). Emotional goal: the steadiness of sitting down before
dawn with one clear screen and knowing exactly where to start.

## Anti-references

- **SaaS-cream / parchment** — the warm near-white editorial-restraint look (the
  saturated AI default of 2026). Escaped via a dark warm-mineral ink ground.
- **Terminal-dark cliché** — the "fintech-that's-not-navy → green-on-black
  terminal" second-order reflex. Avoided via Fraunces serif + warm ember accent,
  not neon-on-black.
- **Generic AI-tool neon** — purple/cyan gradients, glow blobs, glassmorphism.
  Banned and removed.
- **Hustle / productivity-bro** — aggressive "crush your goals" energy, red
  urgency, gamified streak-as-pressure. LifeOS is calm and deliberate.

## Design Principles

1. **Systems over motivation.** The interface should reward the repeatable loop,
   not a burst of willpower. Streaks and reviews adjust the system, not guilt.
2. **Show the product, not a promise.** The real ranked "today" surface is the
   hero. No abstract hero-glow standing in for a screenshot.
3. **The next right move is never in question.** Everything earns its place by
   helping the user see what to do next and why. Leverage scoring is the spine.
4. **Earned familiarity in the app; distinctiveness on the landing.** The
   dashboard should disappear into the task (Linear/Raycast-grade calm); the
   landing is allowed voice. Don't let display-register flourish leak into UI
   labels, controls, or data.
5. **Restraint is the brand.** One ember accent ≤10% of surface, sage for
   completion only. Color is meaning, never decoration.

## Accessibility & Inclusion

Target **WCAG AA**. Body text ≥4.5:1, large text ≥3:1, placeholders ≥4.5:1
(the text ramp is tuned to this against the ink ground). Visible focus states on
every interactive element. `prefers-reduced-motion` is honored globally
(`MotionConfig reducedMotion="user"` plus a CSS fallback). State is never
encoded by the ember/sage accents alone — pair color with text, icon, or
position so it survives color-blindness.
