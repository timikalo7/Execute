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
