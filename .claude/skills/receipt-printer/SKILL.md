---
name: receipt-printer
description: >
  The order-confirmation receipt that prints. After a payment CONFIRMS, a paper receipt
  animates out of the confirmation card — line items, subtotal, tax, total paid, order id,
  masked card, torn bottom edge. Use on every e-commerce / checkout / subscription build at
  the order-confirmation step (owner directive, 2026-08-27), and anywhere a purchase, plan
  change or refund needs a receipt. Enforced by memory/ecommerce-guidelines.md §1b.
---

# receipt-printer — the confirmation that prints

**Owner directive, 2026-08-27: use this on every e-commerce site.** It is not optional
polish; it is the confirmation step's default treatment, listed in the enforced
`memory/ecommerce-guidelines.md` §1b alongside bento grids and the dot-grid ground.

Source: reel `DcHnC0XIx-w` (Josephbadigar). The creator gates the code behind a comment,
so nothing was copied — this is built from the frames. It is CSS and one measured height,
not a library, so there was nothing to take anyway.

## What it is

The confirmation card sits at the top and shows the plan and the total. While the payment
is in flight it shows a spinner. When the processor confirms, a receipt **emerges from
inside the card**, printer-style: logo mark, line items, a dashed rule, subtotal and tax,
**TOTAL PAID**, order id, `Visa •••• 4242`, the date, a barcode, and a torn bottom edge.

## Files

- `reference/demo.html` — the runnable reference. **Open this first.** Self-contained,
  no build step: `python3 -m http.server` in that directory. `?instant` skips the delay.
- `reference/ReceiptPrinter.tsx` — the React port, plain CSS so it drops into any project
  and is then adapted to that project's tokens.

## The four rules that are not cosmetic

**1. The status comes from the PAYMENT PROCESSOR, never a timer.** The demo uses
`setTimeout` because it has no backend; a real build must not. Printing a receipt for a
charge that has not settled is fraud-shaped, not delightful, and it is the single most
likely way this component turns into a dark pattern — which
`memory/ecommerce-guidelines.md` treats as a ship-blocker.

**2. The receipt is semantic TEXT.** Not canvas, not an image, not a screenshot. It has to
be selectable, screen-readable, translatable, and printable. A receipt is a *record*; an
image of a receipt is a picture of one.

**3. Last four digits only.** `cardLast4` is what the processor hands back. Never a PAN,
never anything you had to store in order to know it. (PCI — cross-referenced in
`memory/system-design-patterns.md`.)

**4. It must also exist as a page.** An animation that plays once is not a record. The
receipt needs a permanent URL (order history, emailed copy) — the component takes
`receiptHref` and renders a link to it, and that link is required, not decorative. A user
who reloads, or who arrives from an email six months later, still gets their receipt.

## Accessibility

- `role="status"` on the processing line announces the change once, without stealing focus.
- The barcode is **decorative and `aria-hidden`** — it encodes nothing, so it must not
  pretend to be scannable. If you make it a real code, encode the real order id and label it.
- **Reduced motion: the receipt is simply THERE.** No print animation, no slot transition.
  The information is the point; the printing is decoration, and decoration is what that
  setting turns off. Both transitions are disabled in the media query — verified below.
- Print styles hide the dark card and print the paper alone. Someone will Ctrl+P this.

## Measured, on the reference

Run against `reference/demo.html` in headless Chromium, 2026-08-27:

| claim | result |
|---|---|
| the receipt prints out of the card | slot 0 → **422px**, paper visible |
| it is real text, not an image | `TOTAL PAID` present in `innerText`; text is selectable |
| the card number is masked | `Visa •••• 4242` matches `/•{3,}\s*\d{4}/` |
| **no full card number leaks** | `/\b\d{13,19}\b/` → **false** |
| reduced motion completes instantly | `transition-duration: 0s`, slot already at **422px** |

The torn edge needed two mask layers (a body layer plus a repeating-conic sawtooth strip
with its own height); a single `repeating-conic-gradient` rendered a flat edge and looked
finished until it was screenshotted. **Look at it, do not assume the mask worked.**

## When NOT to use it

- **A free signup, a trial start, or anything with no charge.** A receipt for £0.00 is
  theatre, and theatre around money is the thing to avoid.
- **A failed or pending payment.** Show the failure plainly; do not print anything.
- **Refunds** get their own treatment — a receipt that looks identical to the purchase one
  is how people miss that they were refunded rather than charged again.
