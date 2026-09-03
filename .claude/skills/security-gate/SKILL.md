---
name: security-gate
version: 1.0.0
description: >
  Runnable security gate — the security counterpart to visual-qa. Load and RUN this whenever you
  build or change anything with a security surface: a backend/API, auth, a database, payments,
  file uploads, env/secrets handling, third-party integrations, or before shipping/committing such
  work. Scans for hardcoded secrets, disabled TLS verification, committed .env files, and runs
  npm audit — and FAILS (non-zero exit) on real findings instead of trusting a self-report. Pairs
  with memory/system-design-security-checklist.md (the full 30-item gate) and system-design-patterns.md.
allowed-tools:
  - Bash
  - Read
  - Edit
  - Write
  - Grep
  - Glob
---

# security-gate — run the scan, don't self-attest

The standing problem (your words): agents say "security's fine" without checking. This makes the
high-signal checks mechanical and build-failing, the same way `visual-qa` did for the front end.
It does NOT replace the full checklist (`memory/system-design-security-checklist.md`) — it automates
the parts a script can prove, and the checklist + this skill's risk list cover the rest.

## When to run
- After adding/changing a backend, API route, auth, DB query, payment flow, file upload, or any
  third-party integration.
- Before committing security-sensitive work, and before declaring a build production-ready.

## How to run
```bash
node .claude/skills/security-gate/scan.mjs --dir <project> --audit-level high
```
Exit code is non-zero on any FAIL finding (so it can gate a commit / CI). It writes
`security-gate-report.json`. What it catches:
- **Hardcoded secrets** — private keys, AWS/GitHub/Slack/Stripe/Google tokens, and generic
  `secret/api_key/token = "…"` (skips placeholders and `process.env`/`NEXT_PUBLIC_` reads).
- **TLS verification disabled** — `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- **Committed `.env`** — any tracked `.env*` that isn't `.example/.sample/.template`.
- **`npm audit`** — fails on high/critical advisories.
- **Unverified payment webhooks (FAIL)** — a file *named* like a webhook endpoint that reads the
  request body and never verifies a signature. Both halves of that trigger are deliberate: a server
  that trusts a POST saying "payment succeeded" hands your product away to anyone who can guess the
  URL, while the word "webhook" in a comment is not an endpoint and a blocking rule that fires on
  prose gets bypassed. Cleared by `constructEvent`, `createHmac` + `timingSafeEqual`, `svix`,
  `verifySignature`, or an `X-Hub-Signature` / `stripe-signature` read.
- **Warnings (review, non-blocking):** insecure `http://`, `eval`/`new Function`, **XSS sinks**
  (`dangerouslySetInnerHTML`, `.innerHTML`/`.outerHTML` assignment, `document.write`, `v-html`,
  jQuery `.html()`), shell interpolation, and **file uploads with no visible type or size check**.
  The last two are warnings *on purpose*: a line-based regex cannot tell whether an assigned value
  is user input, and upload validation legitimately lives in middleware this file cannot see. A FAIL
  that fires on `el.innerHTML = ""` would be switched off, and a gate that is switched off checks
  nothing.

## Accepted advisories — when there is genuinely no fix

Some advisories cannot be fixed because upstream has not published one. `projects/example-app` is the real
case: 22 flagged packages, **all** tracing to two DoS advisories in `image-size` — and `image-size@2.0.2`
is the latest published version while the advisory covers `<=2.0.2`. npm's suggested remedy was
`react-native@0.72.17`, a bundler old enough to predate the dependency: a multi-year downgrade, not a
patch.

**Do not lower `--audit-level` to get past this.** That switches the check off for everything,
including the next advisory, which might be a real one. Instead the project carries a
`security-exceptions.json`:

```json
{ "accepted": [ {
  "advisory": "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr",
  "package": "image-size",
  "reason": "no fix exists — 2.0.2 is latest and the advisory covers <=2.0.2; build-time only, not shipped",
  "accepted_on": "2026-08-18",
  "expires": "2026-11-18"
} ] }
```

Three properties make this a gate rather than a mute button: it is **per-advisory** (anything not
named still fails), it **expires** (an entry past its review date fails *louder* than the advisory
did), and it **names a reason** a reviewer can disagree with.

The gate also now reports **root** advisories rather than every package that inherits one. Counting
inheritance turned two real problems into twenty-two and buried the two that mattered.

## Checking the checker

`memory/agent-graph-engineering.md` §3: a gate only ever seen to PASS is not proven to work, and
evaluator decay is this repo's biggest live risk. So the gate has its own test, and every rule is
asserted in **both** directions — the vulnerable fixture must fail, the fixed fixture must pass:

```bash
node .claude/skills/security-gate/self-test.mjs     # 21 assertions

The exception mechanism is proven separately, against a real project rather than a synthetic fixture,
because it needs a real `npm audit` result. Measured on `projects/example-app` 2026-08-18 — **both
advisories accepted → pass; remove one → FAIL; expire them → FAIL with `security-exception-expired`;
delete the file → FAIL with 2 unaccepted roots.** Re-run those four by editing the project's
`security-exceptions.json` and running the scanner against it.
```

Fixtures are written to a temp dir and deleted, and their dangerous payloads are **assembled at
runtime rather than written as literals**. That is not cosmetic. The first version of the test wrote
a real-shaped AWS key and a literal `rejectUnauthorized: false` into its own source, and the repo's
pre-push gate — correctly — blocked the push on the file that proves the gate works. Exempting the
test file would have been the "weaken the gate so the push passes" move the rules forbid, and would
have left a permanent hole shaped like *any file named self-test*. Splitting the literal keeps the
gate at full strength and the temp fixture still receives the real dangerous string.

A pass here is necessary, not sufficient — a script can't test authz or multi-tenancy. For the
reasoning half (IDOR, cross-tenant isolation, mass assignment, business-logic abuse, injection
dataflow), delegate to the **`security-reviewer` agent** (`.claude/agents/security-reviewer.md`) — it
traces each endpoint's source→sink per user. Demonstrated: the scanner *passes* a backend full of
IDOR/SQLi/mass-assignment/negative-transfer bugs (no secrets to find), while the reviewer flags all of
them. If `semgrep` is installed the gate also runs a dataflow ruleset automatically. Walk the checklist
below for new systems regardless.

## New-system risk checklist (ask these for every backend/API/system you add)
Condensed from the OWASP quick-list + the 30-item gate — the questions, unasked, that cause breaches:
1. **Broken access control / IDOR** — is every protected route AND object checked **server-side for
   this user**? Editing an id in the URL must not expose someone else's data. (#1 real-world breach.)
2. **Authn/Authz at the data layer** — not just hidden in the UI; least privilege; multi-tenant rows scoped.
3. **Server-side validation** — re-validate every input on the server; the API is directly reachable.
4. **Secrets** — none in code/repo; env vars + documented `.env.example`; nothing non-`NEXT_PUBLIC_`
   reaches the client. (The scan checks the easy half — confirm the rest.)
5. **Mass assignment / leaky responses** — accept only whitelisted fields; return only needed fields (no PII/internal columns).
6. **Injection** — parameterised queries (no string-built SQL); escape output (XSS); no path traversal from user input.
7. **Session/auth** — rotate session id on login; rate-limit + lockout + block common passwords; short-lived tokens.
8. **Idempotency + retries** — safe to retry; money/events use an idempotency key + immutable ledger (see system-design-patterns.md).
9. **PII & data-subject rights** — minimise, encrypt at rest, access-control; ship self-serve export + delete (GDPR/CCPA — legal must-have).
10. **Dependencies + supply chain** — `npm audit` clean; pinned lockfile; vet `postinstall` and any third-party script/skill before auto-loading; never run an unverified `curl|install`/VSIX.
11. **Transport** — HTTPS only; never disable TLS verification.
12. **Payments** — use Stripe et al.; never roll your own card handling.

Record the verdict (covered / N-A / deferred-with-reason) in the checklist's Pass Log.

## Notes
- General (any project/stack). Heuristic scanners flag for human judgement — a warning isn't proof
  of a bug, and a pass isn't proof of safety; it removes the *easy* misses that slip through "looks fine".


## When a finding fires, the fix is already written

`webhook-unverified`, `upload-no-validation` and the `dangerous-html` warnings each have a
working, tested reference implementation in **`.claude/skills/not-get-sued-101/`**. Every OTHER
rule that reports an absence — `shell-interpolation`, `sql-interpolation`,
`no-rate-limit-reference`, `token-in-localstorage`, `fetch-no-timeout`, `tls-verify-disabled`,
`eval-usage` and the secret rules — is covered by **`.claude/skills/gate-protections/`**.
This gate detects the absence; those skills are the presence. Do not hand-roll a third version.
