# Web & App Security Principles — ship-blockers for every future build

Distilled from the an example marketing site launch (a static marketing site with one third-party form) plus the
30-item `system-design-security-checklist.md` (backends) and `system-design-patterns.md`. This file is
the **default security posture** for any web or app project Execute builds. Load it before building
anything with a network surface. Enforce with the runnable `security-gate` skill (secrets/TLS/deps)
and the `security-reviewer` agent (reasoning-level: authz/IDOR/business-logic) — both are ship-blockers,
not self-attestation.

## 0. The one rule that dwarfs the rest: minimize the attack surface
Prefer the architecture with the fewest things to attack. A **static export** (no server, no DB, no
auth, no sessions, no uploads) structurally eliminates whole vuln classes — SQLi, auth bypass, server
RCE, IDOR, SSRF. If a project can be static + a couple of vetted third-party APIs, do that; only take on
a backend when a feature genuinely requires one. Every server, secret, and stored record you add is a
new liability — justify each.

## 1. Secrets — never in the client, never in git
- **No secret in a client bundle, ever.** Anything shipped to the browser is public. Only truly-public
  tokens belong in `NEXT_PUBLIC_*`/`VITE_*` (Stripe *publishable* key, reCAPTCHA/hCaptcha *site* key,
  Web3Forms *access* key — these only "write to a fixed destination", they can't read or authenticate).
  Real secrets (API secret keys, DB creds, signing keys) live only server-side / in a secrets manager.
- **Know the difference before you expose a key**: a *publishable/submission/site* key is safe in the
  client; a *secret/private/service* key is not. If unsure, treat it as secret.
- `.env` never committed; ship a documented `.env.example` + a project `SETUP-KEYS.md`. `security-gate`
  fails on committed `.env`, hardcoded private keys, AWS/GitHub/Slack/Stripe/Google tokens.
- **Static export bakes env at build time** — the key is compiled into the JS. Setting it in the host
  panel does nothing; rebuild + redeploy to change it. Document this in `SETUP-KEYS.md`.

## 2. Security headers — set them, then verify them on the live host
Every site ships these (via framework middleware for SSR, or `.htaccess`/`_headers`/host config for
static). This is the `.htaccess` set from a shipped static site, now the baseline:
- `Content-Security-Policy` — the big one. Lock `default-src 'self'`; enumerate every external origin
  you actually use in `connect-src`/`frame-src`/`img-src`; `object-src 'none'`; `frame-ancestors 'none'`
  (clickjacking); `base-uri 'self'`; `form-action` limited to self + your form endpoint;
  `upgrade-insecure-requests`. Prefer nonces/hashes over `'unsafe-inline'`; if a static export forces
  `'unsafe-inline'` on script/style, **document why** and compensate (no user-generated content that
  could inject).
- `Strict-Transport-Security` (HSTS, long max-age + `includeSubDomains`; `preload` when ready).
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` (deny camera/mic/geo/payment/usb you don't use), `Cross-Origin-Opener-Policy: same-origin`.
- **A header you can't verify isn't set.** After deploy, `curl -I https://domain` and confirm CSP + HSTS
  are actually present — on shared hosting they only apply if the config file uploaded (hidden-file
  gotcha) and the module is enabled. HSTS/CSP assume HTTPS: enable SSL and force HTTPS.

## 3. Forms & any third-party integration
- **Validate on the real trust boundary.** Client-side validation is UX, not security — the actual
  recipient (your API or the third-party) must reject bad input. Never render submitted input back into
  the page.
- **Spam/abuse defense on any public form**: a hidden honeypot field (drop client-side + let the
  provider reject server-side), the provider's own rate-limiting, and an allowed-domain / captcha when
  needed. Cap the blast radius (free-tier submission limits mean worst case = some spam, then it stops —
  no breach).
- **Pin the third party in CSP** (`connect-src`/`form-action` to exactly that host) so the form can't be
  repointed to exfiltrate elsewhere.

## 4. XSS / injection / output
- Use a framework that auto-escapes (React/Vue/Svelte). The only `dangerouslySetInnerHTML` allowed is
  for **constant, non-user data** (e.g. JSON-LD) — and even then escape `<` (`<`) so a value can't
  break out of a `<script>` tag if the data later becomes dynamic.
- No `eval`/`new Function` on non-constants. Sanitize any HTML you must render (DOMPurify), server-side.
- Backends: parameterized queries only (no string-built SQL); validate + type every input at the edge
  (zod/pydantic); output-encode per context.

## 5. External links, embeds, deps
- `target="_blank"` → `rel="noopener noreferrer"` (reverse-tabnabbing). Better: open external links in
  the same tab when UX allows.
- Third-party embeds (maps, videos) are surface — use reputable ones, allow them explicitly in CSP, and
  prefer privacy-friendly variants.
- **Dependencies**: `npm audit` (fail on high/critical) in the gate; keep the lockfile; avoid pulling
  tools/skills/scripts from outside the vetted library. **Supply chain: never auto-load a third-party
  skill/plugin/MCP without reading what scripts it runs first.**

## 6. Privacy & data-subject rights (legal ship-blockers, not nice-to-haves)
- Collect the minimum; don't store PII you don't need. No trackers/cookies without consent; self-host
  fonts to avoid third-party calls. If you store user data: encrypt in transit + at rest, and provide
  **self-serve export + delete** (GDPR/CCPA) — this is a hard requirement, same tier as WCAG AA.
- State a privacy basis for any data flow (even "the form emails your message to the church and stores
  nothing").

## 7. Backends (when a project has one) — the 30-item gate still applies
`system-design-security-checklist.md` governs: authn/session hardening, **authorization on every object
(no IDOR / broken multi-tenant isolation)**, rate limits + per-user quotas (esp. AI/token endpoints),
SSRF/file-upload/webhook-signature checks, no secrets in logs, structured logging, least-privilege,
and the `security-reviewer` reasoning pass a scanner can't do. AI features: per-user token caps, prompt-
injection awareness on tool-calling agents, and never trust model output as a command.

## The gate, every build
1. `node .claude/skills/security-gate/scan.mjs --dir <project>` → secrets, TLS-off, committed `.env`,
   `npm audit` high/critical. Non-zero exit fails the build.
2. `security-reviewer` agent for anything with a backend/API/auth/DB/payments/uploads.
3. For a static/front-end site: the header + CSP + form-hardening + verify-live-headers checklist above.
Do not declare "secure" from reasoning alone — run the gate and `curl -I` the live host.
