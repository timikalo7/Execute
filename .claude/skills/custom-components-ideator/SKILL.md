---
name: custom-components-ideator
description: >
  Generate a project-specific list of BESPOKE custom interactive components/mechanics to build, from a
  project's context (domain, brand, content, sitemap). Use at the start of any site/app design, during
  /kickoff's design phase, or whenever asked "what custom components/sections should this have", "give me
  component ideas", "make it custom / not generic / not a template". Turns a domain into a per-section
  mechanic list — the way an example marketing site got the Bible-as-nav, the baptism scroll scene, fishing-for-men, the
  praying-hands tilt. Pairs with owner-design-taste (the LAW); this is the generator that applies it.
---

# Custom Components Ideator — turn a domain into bespoke mechanics

**Principle (from owner-design-taste):** "custom" = a distinct interactive MECHANIC per section, drawn from
the project's OWN domain — never a card-grid template. This skill answers "what is this project about?" →
"here are the components to build." Output ideas, not code; hand the chosen ones to the developer.

## 1. Gather context first (don't ideate blind)
- **Domain & what it's *really* about** — the felt story (a church's faith journey; an example app's fight against
  wasted time; a fintech's money moving safely).
- **Brand** — palette + ONE accent, type, voice.
- **Sitemap** — the pages/sections that need a mechanic each.
- **Real content/data** — scripture & service times; metrics & streaks; products & prices. Mechanics must
  carry *real* content/CTAs, never a fake demo.
- **Audience + the emotional beat** each page should land.

## 2. Method
1. **Mine the domain for raw material** — its symbols, rituals, objects, data shapes, metaphors, and
   emotional beats. (Church → the Book, the cross, baptism, fishers of men, "come as you are." an example app →
   the day, momentum, the plan, focus. Fintech → money flow, the ledger, the receipt, the growth curve.)
2. **One mechanic per section.** Pick a single metaphor per page and turn it into an interaction. If two
   sections would share a layout, one is wrong.
3. **Choose the interaction type** from the primitive menu below that fits the metaphor + content.
4. **Pressure-test each idea:** on-domain (not decoration)? carries real content/CTA? readable over any
   image? a11y + reduced-motion? one accent? not a repeated template?
5. **Rank** — one **signature centerpiece** first, then a few supporting mechanics. Don't make a circus.

## 3. Interaction-primitive menu (what "a mechanic" can be)
- **Domain-object-as-navigation centerpiece** — the site *is* the domain object (an example marketing site = an openable
  Bible; a recipe site = a cookbook; a label = a vinyl record). The signature move.
- **Pinned scroll-driven SVG scene** — a hand-drawn illustration animates as you scroll, revealing copy/CTAs
  (dove descending, cross climbing, net casting).
- **Numbered pinned steps** (.01/.02/.03) — a process as one pinned, scroll-advanced scene (first visit,
  onboarding, how-it-works).
- **Cursor-reveal hero** — oversized type in front, imagery/loop revealed behind by the cursor.
- **Full-bleed alternating gallery** — items as alternating full-bleed photos; hover reveals the motto.
- **Interactive in-product artifact** — a believable live tile/card/story (a day-plan, a dashboard tile, a
  ledger stamping a row) — honest, not a fake screenshot.
- **Hover/drag micro-mechanics** — draggable marquee, hover line-fill, animated-hamburger → overlay menu.
- **Contained 3D-tilt glyph** — a domain mark (cross, praying hands, a key) tilting to the cursor over a
  glow, sitting beside copy (the companion to a scene).

## 4. Output (the deliverable)
A ranked table — **Component · Page/section · Domain metaphor · Interaction primitive · Build approach (SVG
scroll / framer pin / cursor / CSS) · Effort S·M·L · Carries which real content/CTA** — led by a one-line
**signature centerpiece** call-out, and a note on the ONE accent + the photo/asset needs.

## 5. Worked examples (proof it produces, not theorises)
- **Church — an example marketing site:** *Bible-as-nav* (centerpiece, each chapter a page); baptism dove scroll scene
  (Connect); Via Dolorosa cross-climb with the visit CTAs revealed in the climb (Plan-your-visit);
  fishing-for-men interactive net over a real casting photo (Join); praying-hands 3D-tilt beside the give
  reasons (Give); 3-moments pinned steps (home); full-bleed Expressions gallery; warm welcome hero.
- **Productivity — an example app:** the day-as-timeline pinned scene; a streak/momentum live tile; goal→deliverable
  ROI artifact; exam-readiness banner; subject-mastery rollup. Domain = time/goals/momentum, not faith.
- **Fintech dashboard (illustrative):** a money-flow Sankey that animates on scroll; an immutable-ledger
  "receipt" that stamps each row; a growth curve that draws as you read; a "safe-to-retry" idempotency
  micro-explainer.

## Don'ts
No generic card grid, ghost-numeral filler, or fake product demo. Every mechanic must embody a *real* domain
metaphor and carry real content. Never AI-generate people for a real org (real stock). Keep it to one
signature + a few supporting — restraint reads as taste.

Pairs with: **owner-design-taste** (the law it applies) and **visual-qa** (verify each mechanic ships clean).
