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
- **Warnings (review, non-blocking):** insecure `http://`, `eval`/`new Function`, `dangerouslySetInnerHTML`, shell interpolation.

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
