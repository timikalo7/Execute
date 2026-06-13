---
target: app/dashboard/page.tsx
total_score: 26
p0_count: 0
p1_count: 2
timestamp: 2026-06-13T21-06-16Z
slug: app-dashboard-page-tsx
---
# Critique — app/dashboard/page.tsx (LifeOS, product register)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Toggle/ring/streak/loading all good; no save confirmation on QuickAdd, no SR announcements |
| 2 | Match System / Real World | 3 | "Leverage/Engine/loop" fits the persona, but the leverage 0–100 scale is never explained |
| 3 | User Control and Freedom | 2 | Add + toggle only; no edit/delete/reorder; leverage (the core value) can't be adjusted |
| 4 | Consistency and Standards | 3 | Strong component vocabulary; two different add-button styles; leverage chip hidden on mobile |
| 5 | Error Prevention | 3 | Empty-title guard + sensible defaults; few destructive paths |
| 6 | Recognition Rather Than Recall | 3 | Labeled block/domain chips; leverage value still needs recall |
| 7 | Flexibility and Efficiency | 2 | Enter/Esc in QuickAdd only; no global shortcuts or bulk actions for a power-user product |
| 8 | Aesthetic and Minimalist Design | 4 | Genuinely excellent — calm, restrained, clear hierarchy |
| 9 | Error Recovery | 2 | Essentially no error states; only "Active goals" has an empty state |
| 10 | Help and Documentation | 1 | Novel concepts (leverage score, domain health) with zero explanation anywhere |
| **Total** | | **26/40** | **Acceptable — beautiful shell, thin product depth** |

## Anti-Patterns Verdict
**LLM assessment:** Does NOT read as AI-generated. Distinctive on both altitudes — Fraunces serif on warm ink, one ember accent, "command deck" restraint escapes both SaaS-cream and terminal-dark. Aesthetic is a genuine 4.
**Deterministic scan:** `detect.mjs` on the page + components/dashboard → 0 findings, exit 0. Clean.
**Visual overlays:** Not available — headless container, no browser automation. Source + detector fallback only.

## Priority Issues
- **[P1] Novel concepts ship with zero help.** "Leverage 95", "domain health 72" — the two ideas the whole product rests on are never defined. New users can't trust a ranking they don't understand. Fix: inline definition on first encounter (a "?" affordance on the Engine header / a one-line scale legend under the leverage chip). → /impeccable clarify
- **[P1] Task control is read-mostly.** You can add and complete, but not edit, delete, reorder, or re-rank. The engine's leverage order is the product's spine, yet the user can't correct it when they disagree. Fix: per-row actions (edit/delete) + a way to nudge leverage. → /impeccable harden
- **[P2] Display serif on data readouts.** Product-register ban: Fraunces drives the ProgressRing percentage and the done/remaining/focus-left Stat numbers. Display fonts in data read as "off" to category-fluent users and the numbers don't align in a tabular column. Fix: move data to the grotesk/mono with tabular-nums; reserve Fraunces for the greeting moment. → /impeccable typeset
- **[P2] The core signal disappears on mobile.** The leverage chip (`hidden ... sm:grid`) and the streak badge (`hidden sm:inline-flex`) are both removed below sm — so the phone user, opening before dawn, loses both the ranking and the motivational anchor. Fix: a compact rank/streak treatment for mobile, not removal. → /impeccable adapt
- **[P2] No empty state for the Engine.** "Active goals" teaches when empty; the tasks panel doesn't. A zero-task day renders a blank panel with no next step. Fix: a teach-the-interface empty state that points to add/review. → /impeccable onboard

## Persona Red Flags
**Alex (Power User):** No keyboard shortcuts to complete/navigate tasks (only inside QuickAdd). No bulk complete, no reorder. The engine ranks but he can't act on the ranking fast.
**Sam (Accessibility):** Leverage chip hidden on mobile removes a meaning-bearing signal; `text-faint` (~OKLCH 56%) on small uppercase captions is below AA for small text; toggle/add produce no screen-reader status announcement. Positives: real `aria-label`s, visible `focus-visible` rings on Button.
**Morgan (Founder-Athlete, project persona):** Opens before dawn wanting THE move — the greeting + "highest-leverage move right now is X" nails the peak. But an unexplained leverage scale quietly erodes trust in the order, and there's no way to overrule the engine when lived context disagrees.

## Minor Observations
- Two add affordances differ: header "Add" is a mono text button; QuickAdd uses the Button component. Pick one vocabulary.
- DomainBalance tints repeat (career/projects both amber, health/spiritual both sage) — labels carry it, but color stops being a unique identifier.
- Sign-out is a bare icon with no confirm — fine for low stakes, but it sits one tab-stop from the avatar with no separation.

## Questions to Consider
- What would make a first-timer trust the leverage number on day one without reading a doc?
- If the engine's ranking is the product, why can't the user touch it?
- What does this dashboard feel like at 6am on a phone, the actual primary scene?
