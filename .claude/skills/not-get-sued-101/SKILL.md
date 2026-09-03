---
name: not-get-sued-101
description: >
  The three protections a scanner can flag as missing but cannot provide: a payment webhook
  that verifies its signature, a file upload that validates by magic bytes, and the XSS
  answer (escape, JSON-LD escaping, or an allowlist sanitiser). Use when building or
  reviewing any endpoint that receives a webhook, accepts a file, or renders HTML it did
  not author — and whenever `security-gate` reports `webhook-unverified`,
  `upload-no-validation` or a `dangerous-html` warning.
---

# not-get-sued-101 — the code the gate is looking for

`security-gate` can tell you a webhook handler never verifies. **It cannot verify one.**
This skill is the other half: working, tested implementations of the three things the
`DcKoJWSuQd8` whiteboard listed — file uploads, payment webhooks, XSS.

The gate rules came first (2026-08-17). This is the part that was missing until the owner
pointed out that detection is not protection.

```bash
node .claude/skills/not-get-sued-101/reference/self-test.mjs   # 32 assertions
```

## 1. `reference/webhook.mjs` — a webhook that verifies

An unverified payment webhook is an endpoint where anyone who knows the URL can POST
`{"type":"payment.succeeded"}` and get free goods. That is why `security-gate` scores it
**FAIL**, not WARN.

Four things are load-bearing, and three are routinely got wrong:

1. **Verify the RAW body.** Once JSON is parsed and re-serialised, key order and
   whitespace have changed and the signature can never match. The usual "fix" for that is
   to stop verifying — which is exactly how handlers end up unverified.
2. **Constant-time compare.** `===` on a signature leaks it by timing.
3. **Bound the timestamp.** Without it, one captured valid request replays forever.
4. **Missing header is a rejection**, never a skip. The most common real hole.

## 2. `reference/upload.mjs` — an upload that validates

The client's MIME type and the file extension are both attacker-controlled. **The bytes
decide.** Size is checked first and cheaply; magic bytes determine the type; the stored
filename is generated, never the client's; and **SVG is refused** because it is a script
container, not an image.

The serving rules are half the vulnerability and live outside the function — different
origin, `nosniff`, `Content-Disposition: attachment` for non-images, never a directory the
app can execute. They are documented at the bottom of the file.

## 3. `reference/safe-html.mjs` — the XSS answer, in order

1. **Don't render HTML.** `textContent` / JSX `{value}` escapes for you and there is no
   vulnerability to reason about. 90% of cases stop here.
2. **Trusted non-user data in a `<script type="application/ld+json">`?** `jsonLdSafe` —
   escaping `<` as `<` is valid JSON *and* cannot close the tag. This is what
   `an example marketing site/src/app/layout.tsx:137` already does, which is why that
   `dangerouslySetInnerHTML` is a correct WARN rather than a bug.
3. **Genuinely need user HTML?** `sanitizeHtml` — an allowlist of tags, attributes and URL
   schemes. Never a denylist; you will always be one payload behind.

**Honest limit:** for hostile user-generated content at scale, use DOMPurify (browser) or
sanitize-html (server). This exists so "we needed something and there was nothing" never
ends in `.innerHTML = ` of raw input, and so the rules fit on one screen.

## Proven in both directions — that is the point

A validator only ever shown *accepting* is not proven to validate. Every rule has a
rejection test: wrong secret, tampered body, replayed request, missing header, parsed body
instead of raw; HTML renamed to `.png`, an SVG, a lying MIME type, an oversized file, path
traversal in the filename; a script tag, an `onerror`, a `javascript:` href, a `data:`
href.

**Two things the self-test caught in this skill's own code:**

- **A wrong assertion, not a wrong implementation.** The `data:` test banned the literal
  string `data:` and failed on output that was *already safe* — the URL survived only as
  escaped, inert text. The property that matters is no **live** `href="data:` and no
  unescaped `<script`. A test that fails on safe output trains you to ignore it.
- **A real flaw it exposed anyway.** That same input produced an unbalanced `</a>`,
  because the opening tag was escaped as text (an attribute containing `<` defeats the
  tokenizer, by design) while the closing tag was still emitted — which could close an
  element belonging to the caller. The sanitiser now tracks open tags, drops closers that
  were never opened, and closes anything left open.
