# E-commerce guidelines — ENFORCED for any store build

**Ship-blocker, same class as accessibility and data-subject rights.** Any build that sells
things — a cart, checkout, product pages, subscriptions, or a payments integration — MUST be built
against this file and reviewed against it before shipping. Enforcement (see bottom) is mechanical
via `system-design-gate` (it detects e-commerce signals and requires documented evidence this was
applied) **plus** the `product` agent (conversion/UX + dark-pattern review) and the
`security-reviewer` agent (payments/PCI/webhooks/subscription law). The gate reminds; the agents
reason.

## 1. Conversion & merchandising (make more per visitor)
- **Premium presentation.** Clean product pages, real photography incl. packaging/lifestyle shots,
  strong visual hierarchy, generous whitespace. No template slop (owner-design-taste law applies).
- **Subscribe & Save (subscription) — LTV +30–50%.** Offer it where the product is consumable/repeat:
  clear discount + free shipping/gift, obvious cadence ("every 30 days"), and a **genuinely easy
  cancel** (see §3 — a hard-to-cancel sub is illegal, not clever).
- **Bundles / cross-sell / upsell — AOV +15–25%.** "Frequently bought together," tiered/volume offers,
  a relevant post-add-to-cart upsell. Relevant, not spammy.
- **Frictionless path to purchase.** Obvious add-to-cart, minimal checkout steps, **guest checkout**,
  saved-cart persistence, mobile-first (most commerce is mobile — verify at 390px via visual-qa).
- **Trust on the page.** Real reviews/ratings + UGC, clear pricing, visible shipping/returns, security
  badges near checkout. Fast LCP (real product images optimized — curated-stock/webp rules).
- **Honest pricing psychology.** Anchor against the true alternative, not a fake inflated "was" price
  (`marketing-persuasion.md`). Persuade with real value, never fabricated scarcity.

## 1b. Visual & brand design — REQUIRED for e-commerce sites (owner directive, from the NOTHING.tech teardown)
These are not optional polish; a store build must implement them.
- **Bento grids.** Use bento-box layouts for product/feature/lifestyle showcases — varied cell sizes in a
  tidy grid, each cell one idea (a product, a benefit, a lifestyle shot). (Also good design **in general**,
  not just commerce — see `owner-design-taste`.)
- **Structured grid / dot-grid background.** A subtle dot-grid or visible structural grid gives the premium,
  engineered feel; align everything to it. No floating, ungridded layouts.
- **Brand-forward, restrained typography.** A distinctive display face (mono / pixel / editorial) paired with
  a clean body; heavy black-and-white / neutral restraint with sparse accent. Type carries the brand.
- **Asset-rich, real imagery.** Many real product renders / photography (the reference shipped 50+ assets),
  one-use-per-image, optimized webp. No stock-people slop, no thin single-image pages.
- **Multi-region / localized storefronts** when selling internationally: per-region entry
  (`us.` / `uk.` / `eu.` …), localized currency, language, shipping, and legal — not one global page.
- Reference stack from the teardown (choose from the tool library): React + Shopify + a headless CMS
  (Sanity) + Tailwind + Framer Motion. (Execute's UI-library ratio + `owner-design-taste` still govern.)
- **The order confirmation PRINTS A RECEIPT — required (owner directive, 2026-08-27, from reel
  `DcHnC0XIx-w`).** At the confirmation step, a paper receipt animates out of the confirmation card:
  line items, subtotal, tax, **TOTAL PAID**, order id, masked card, date, torn bottom edge. Built and
  proven in the **`receipt-printer` skill** (`.claude/skills/receipt-printer/`, with a runnable
  `reference/demo.html` and a React port) — use that, do not re-invent it.
  Four constraints travel with it and are **ship-blockers, not preferences**:
  1. the "complete" state comes from the **payment processor**, never a timer — a receipt for a charge
     that has not settled is a dark pattern, which this document already treats as a hard line;
  2. the receipt is **semantic text**, never an image or canvas — selectable, screen-readable,
     translatable, printable, because a receipt is a record;
  3. **last four digits only**, as returned by the processor (PCI — see §4);
  4. it must **also exist as a permanent page** (order history / emailed copy). An animation that
     plays once is not a record; the component takes a required `receiptHref`.
  Not for £0.00 signups or trials, not for failed/pending payments, and refunds get their own
  treatment so nobody mistakes a refund for a second charge.

## 2. Product-page & catalog essentials
- Complete: title, price, variants, availability, benefit-led copy + ingredients/specs, shipping/return
  summary, cross-sell block, add-to-cart above the fold on mobile.
- Search + filter + pagination on the catalog (no N+1); fast, accessible.

## 3. Trust, compliance & consumer-law ship-blockers (the hard line)
- **No dark patterns.** No fake countdown timers, no fake stock scarcity, no hidden fees revealed at
  the last step, **no pre-checked add-ons/subscriptions** (illegal in the EU; FTC-actionable in the US).
- **Subscriptions must be honest:** clear renewal price + cadence BEFORE purchase, a working
  **click-to-cancel** as easy as sign-up (US FTC click-to-cancel; EU consumer-rights), renewal reminders
  where required. No forced-continuity traps.
- **Policies present & truthful:** shipping, returns/refunds, terms, privacy. Accurate delivery estimates.
- **Taxes/VAT** calculated correctly for the customer's region; prices show tax-inclusive where the law
  requires (EU/UK).
- **Accessibility (WCAG 2.1 AA)** and **data-subject rights (export + delete)** — already ship-blockers,
  and they apply to the whole funnel incl. checkout.

## 4. Payments & system-design security (cross-ref — already gated)
- **Never handle raw card data** — use a provider (Stripe web; RevenueCat/StoreKit/Play Billing for
  mobile IAP). Card data never touches your server (PCI scope stays with the provider).
- **Money is idempotency key + immutable append-only ledger + HMAC-signed webhooks + transactional
  outbox → DLQ** — never a single mutable `status` row (`system-design-patterns.md`).
- Rate limiting, server-side validation of price/qty (never trust client-sent price), no secrets in the
  client bundle, webhook signature verification (`security-gate` + `system-design-gate` check the
  mechanical parts).

## Enforcement
`system-design-gate` flags a project as e-commerce when it has payment/commerce deps (stripe, shopify,
medusa, snipcart, lemonsqueezy, revenuecat…) or cart/checkout/product routes, and then **FAILS the push**
unless the project documents that this guideline was applied — an `ECOMMERCE.md` in the project, or a
`PROJECT-LOG.md` entry that references the e-commerce guideline / dark-pattern + subscription-compliance
review. That forces the `product` + `security-reviewer` pass on the reasoning parts a scanner can't judge
(conversion, dark-pattern, consumer-law). Same ship-blocker class as a11y and data-rights.
