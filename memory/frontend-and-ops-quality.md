# Frontend polish & operational quality — make a vibe-coded app feel pro (owner transcripts, 2026-06)

Curated from the owner's reference creators. These are the cheap, high-signal things agents skip. Apply to
**app UIs / dashboards** (NOT the owner's marketing-site taste — that one deliberately avoids icon buttons,
tooltips, skeleton chrome; see `owner-design-taste`). No contradiction: different surfaces, different rules.

## UI/UX polish (app interfaces)
- **Tooltips on icon-only buttons** — and give every button a text/`aria-label`. An icon with no label or
  tooltip is a guessing game (also an a11y fail).
- **Skeleton loaders** — grey placeholder bars matching the eventual layout while data loads; beats a spinner
  or layout shift.
- **Optimistic UI** — reflect the user's action immediately, reconcile with the server after; the app feels
  instant instead of laggy.
- **Consistent type hierarchy** — bolder/larger = heading; body must never be as heavy as the heading above
  it. Pick good free fonts (Google Fonts), don't ship the model's default.
- **Empty/error/loading states** for every async view; specific user-facing errors + developer logs.

## Performance
- **Pagination / virtualisation** for long lists — never fetch-and-render thousands of rows at once.
- **Kill N+1 queries** — batch/`include`/join instead of a query per row in a loop.
- **Async the slow stuff** — don't block the request on long work; queue it (job + webhook/poll), stream LLM output.

## Operability (ship-blockers, not nice-to-haves)
- **A test suite** — pick the framework for the stack, keep it green, gate CI on it.
- **Observability** — structured logs + error tracking + alerts on the critical paths; you need a tight loop
  to know when/where it broke in prod (not "a user told me").
- **PII handling** — minimise collection, encrypt at rest, access-control, self-serve export+delete; it's the
  user's risk AND the business's liability. Payments/cards → a provider (Stripe), never DIY.

> Cross-refs: realtime/multiplayer & payments shapes → `system-design-patterns.md`; the security gate →
> `system-design-security-checklist.md`; a11y is a legal ship-blocker (verify with axe, don't self-report).

## Destructive actions are a design language (delete / disable / wipe)
Any irreversible action needs friction proportional to the damage. A bare `Delete` button next to
`Cancel` is a bug. Apply these to every delete/destroy/disable flow — including the **self-serve data
export + delete** that data-subject rights already make a ship-blocker.
1. **Confirmation must cost something.** Either **hold-to-confirm** (press and hold while a ring
   fills; releasing early cancels — the ring IS the confirmation) or **type-to-confirm** (make the
   user type the project/account name). A one-click `OK` is muscle memory, not consent.
2. **Keep it off the happy path.** Never place the destructive control where the safe one usually
   sits. Muscle memory clicks blind.
3. **Red is a budget.** Reserve red for genuinely destructive actions and nothing else. If red is
   decoration elsewhere, it stops being a warning.
4. **Bury it.** Dangerous settings live at the bottom of the page, behind a disclosure. Friction is
   protection, not bad UX.
5. **Prefer soft-delete with a grace period.** "Scheduled for deletion — 14 days to undo" beats an
   instant hard delete: it converts an irreversible action into a reversible one. Show the countdown
   and a single-click undo. (Where law requires actual erasure, hard-delete on schedule and say so.)
6. **Name the blast radius in the dialog** — what exactly is destroyed, how many items, and whether it
   can be recovered. "Delete project?" is not enough.

## Animate compositor properties, never layout
Animate **`transform`** and **`opacity`** only. Animating `top`/`left`/`width`/`height`/`margin`
forces the browser to re-measure, re-paint and re-layer **every frame** — that is the jank. `transform`
is handled by the compositor and skips layout/paint entirely.
- Move with `translate`, size with `scale`, never with `left`/`width`.
- `will-change` is a scalpel: apply it to the element about to animate, remove it after. Blanket
  `will-change` wastes memory and can make things slower.
- This is checked by eye too easily — confirm INP/CLS in `visual-qa`/Lighthouse, not by watching it
  look smooth on a fast machine.
- Applies to GSAP and Framer Motion alike (both animate transforms by default — don't fight them by
  tweening layout properties).
