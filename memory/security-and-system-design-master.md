# Security & System-Design Master Law — every project, every app type

The single top reference for building safely and soundly. It sits **above** the deep-dives:
`webapp-security-principles.md` (web/static/front-end), `system-design-security-checklist.md` (the 30-item
backend gate), `system-design-patterns.md` (payments/caching/webhooks/gRPC shapes). Enforced by the
`security-gate` skill (mechanical) + `security-reviewer` agent (reasoning). **Load this for every build;
apply the sections whose trigger the project meets. Never self-attest "it's secure" — run the gate and,
for anything live, probe it.**

Two truths frame everything: **(1) minimize the attack surface** — the safest component is the one you
didn't build; prefer the simplest architecture that meets the need (static > server; managed > self-run;
fewer secrets/stores/integrations). **(2) Design for failure** — assume every dependency, network call,
and input will fail or be hostile; degrade safely, never fail open.

---

## PART A — UNIVERSAL BASELINE (applies to EVERY project, any type)
- **No secrets in client/artifacts/git.** Publishable/site/submission keys only in client; real secrets in
  a secret manager, never in code/logs/URLs/error messages/Docker layers. `.env` never committed;
  `.env.example` + `SETUP-KEYS.md`. Rotate; least-privilege scope; short-lived tokens.
- **Validate at every trust boundary.** Schema-validate + type all external input (zod/pydantic/…), reject
  unknown fields (mass-assignment), enforce size/rate limits. Client validation is UX, never security.
- **Encode on output, per context.** Auto-escaping framework for UI; parameterized queries only (never
  string-built SQL/NoSQL/OS commands); safe deserialization (no pickle/unsafe YAML/`eval` on non-constants).
- **Least privilege everywhere** — DB users, cloud IAM, API scopes, file perms, container caps.
- **TLS/HTTPS everywhere**, modern ciphers; verify certs (never disable verification); no plaintext transport.
- **Dependencies:** lockfile committed, `npm/pip/cargo audit` fails on high/critical, automated updates
  (Dependabot/Renovate), pin versions, verify provenance, watch typosquats/dependency-confusion.
- **Fail safe + don't leak:** deny by default; generic user-facing errors + detailed server logs (no
  secrets/PII in logs); no stack traces to users.
- **Backups + a *tested* restore** for anything with state. **Observability:** structured logs, audit trail
  for sensitive actions, anomaly alerting, an incident runbook.
- **Legal ship-blockers:** accessibility (WCAG 2.1 AA where there's a UI) and data-subject rights
  (self-serve export + delete) for stored personal data — same tier as a security bug.
- **Supply-chain hygiene for the build itself:** never auto-load/run a third-party skill/plugin/script/MCP
  without reading what it does first.

## PART B — SYSTEM-DESIGN PRINCIPLES (sound + reliable, not just secure)
- **Single source of truth** per datum; one canonical schema, parsed at every boundary. Idempotency on any
  retryable/mutating op (payments, webhooks, jobs) — dedupe keys, exactly-once effect.
- **Statelessness + horizontal scale** where possible; push state to a store, not the process. Cache with a
  clear invalidation story (see patterns doc); set timeouts, retries-with-backoff + jitter, circuit
  breakers, and bulkheads on every remote call. **No unbounded work** — paginate, stream, cap fan-out.
- **Backpressure + quotas:** rate-limit + per-user resource/cost caps (esp. AI token spend — a cost-DoS
  vector). Graceful degradation + feature flags + kill switches for risky paths.
- **Data lifecycle:** migrations are reversible + tested; retention + deletion policy; separate dev/stage/prod;
  no prod data in lower envs.
- **Concurrency correctness:** guard race conditions/TOCTOU (locks, transactions, optimistic concurrency);
  design for at-least-once delivery (so consumers must be idempotent).
- **Deployability:** reproducible builds, health checks, zero-downtime deploys/rollback, config via env not
  code, secrets injected at runtime.

## PART C — SECURITY BY SURFACE (apply the ones the project has)
**Auth & sessions (any login):** hash passwords (argon2id/bcrypt), offer MFA, secure session cookies
(`HttpOnly; Secure; SameSite`), rotate session on login, expire/revoke; **CSRF tokens** for cookie auth;
prevent account enumeration + brute-force (lockout/backoff); secure, short-lived, single-use reset tokens;
don't put auth tokens in `localStorage` (XSS-exfiltratable). OAuth/OIDC: validate `state`+PKCE, verify token
signatures + audience/issuer.
**Authorization:** deny-by-default, **enforce server-side** (never trust client role checks), object-level +
field-level (kill IDOR / broken multi-tenant isolation — the #1 real-world breach).
**Input surfaces:** file uploads (validate type/size/**content**, store outside webroot, never execute, AV
scan, random names); **SSRF** — allowlist outbound hosts, block internal ranges + cloud metadata
`169.254.169.254`; XXE off in XML parsers; template-injection safe.
**Business logic (the reasoning review):** race conditions, replay, negative/oversized quantities, price/
workflow tampering, coupon/limit abuse, mass-assignment of privileged fields.
**Web front-end specifics:** full security-header + CSP set *verified live* (see webapp doc), SRI for any
CDN script, `postMessage` origin checks, no prod source-maps, clickjacking (`frame-ancestors`).
**Headers/transport for APIs:** CORS locked to known origins (never `*` with credentials), content-type
enforcement, no verbose framework banners.
**AI/LLM features:** treat model output as untrusted (never execute it as SQL/shell/command unvalidated),
**prompt-injection** defense on tool-calling agents + RAG over untrusted content, keep secrets/PII out of
prompts, per-user token/cost caps, jailbreak/abuse handling, log + review tool calls.
**Third-party integrations:** minimal API scopes, **verify webhook signatures**, pin the endpoint in
allowlists/CSP, vet the vendor's data handling, least data shared.

## PART D — INFRA, DNS, EMAIL, COMPLIANCE
- **Infra/cloud:** no public buckets/DBs, security groups/firewalls least-open, no default creds, image
  scanning, secrets manager (not env files in prod), separate accounts/roles per env, CI/CD secret handling
  + provenance, IaC scanned.
- **DNS/domain:** registrar lock, DNSSEC, **watch subdomain-takeover / dangling DNS** (retire old records
  when you decommission a site — e.g. `old.` subdomains).
- **Email:** **SPF + DKIM + DMARC** (anti-spoofing + deliverability) for any transactional mail.
- **Payments:** never touch raw card data — use a PCI-compliant processor (Stripe/…); idempotent webhooks;
  reconcile server-side; never trust client-sent prices.
- **Compliance:** GDPR/CCPA (lawful basis, minimize, export+delete), cookie consent, age-gating if relevant,
  PCI-DSS (payments), HIPAA (health), SOC2 posture for B2B.

## PART E — APP-TYPE ADDENDA (in addition to A–D)
- **Static / marketing web:** the webapp doc in full — headers/CSP verified live, form honeypot + provider
  rate-limit + endpoint pinned, no client secrets. Lowest surface; prefer it when it fits.
- **Web app / SPA + API backend:** all of A–D; watch IDOR, CSRF, CORS, JWT handling, rate limits, the 30-item
  backend checklist.
- **Mobile (iOS/Android/RN/Expo):** no secrets in the bundle (decompilable), secure storage (Keychain/
  Keystore, not plain prefs), **certificate pinning** for sensitive APIs, jailbreak/root awareness, deep-link
  validation, least runtime permissions, obfuscate where it matters, OTA-update integrity.
- **Desktop / CLI / software solutions:** validate all args/stdin/config/file paths (path-traversal,
  symlink attacks); never `shell=True`/string-interpolated exec; drop privileges; **sign + checksum releases
  + secure auto-update** (verify signatures); safe temp-file handling; sandbox untrusted input; don't run as
  admin/root; supply-chain-check bundled deps; guard against DLL/dylib hijacking + insecure PATH.
- **APIs / microservices:** authn+authz per endpoint, per-client rate limits + quotas, schema/contract
  validation, versioning, mTLS or signed service-to-service auth, no internal service exposed publicly,
  gateway + WAF, structured error contracts.
- **Data / ML / analytics:** PII minimization + anonymization/pseudonymization, access controls on datasets,
  data-poisoning + model-inversion/membership-inference awareness, secure model storage, validate training
  data provenance, don't leak training data in outputs, guard feature pipelines.
- **Real-time (WebSocket/WebRTC):** authenticate + authorize the connection (not just the handshake),
  per-message validation + rate limits, origin checks, message-size caps, backpressure.
- **Embedded / IoT:** secure boot + signed firmware + secure OTA, no hardcoded/default device creds, encrypt
  device↔cloud, minimal services, hardware root of trust, physical-tamper + debug-port hardening.
- **Browser extension:** minimal `permissions` + host_permissions, no remote code (`eval`/remote scripts),
  strict CSP, validate all `postMessage`/content-script↔page boundaries, don't expose privileged APIs to pages.
- **Blockchain / smart contracts:** reentrancy guards, checks-effects-interactions, integer-overflow safety,
  access control on privileged fns, oracle-manipulation + front-running (MEV) awareness, **independent audit
  + testnet + formal reasoning before mainnet**, upgradeability/key-management plan.
- **Games / multiplayer:** authoritative server (never trust the client for state/score/economy), anti-cheat,
  rate-limit actions, validate all client messages, protect IAP/economy from replay + tampering.

## Gate, every build
1. `security-gate` skill — secrets/TLS/committed-.env/`npm audit` (fails the build).
2. `system-design-gate` skill — the mechanically-checkable slice of THIS document (lockfile committed,
   .env.example completeness, TODO(keys)⇒SETUP-KEYS, PROJECT-LOG exists, no string-built SQL, no auth
   tokens in localStorage) — fails the build.
3. `security-reviewer` agent — the reasoning pass (authz/IDOR/multi-tenant/business-logic/injection dataflow)
   for anything with a backend/API/auth/DB/payments/uploads.
4. Apply the app-type addendum + verify live (headers via `curl -I`, an actual cross-tenant test, a real
   upload/SSRF probe). "It's all good" from reasoning alone is not evidence.

**Enforcement is mechanical, not remembered:** `.claude/hooks/pre-push-gate.sh` blocks `git push` to ANY
branch (PreToolUse guard + `.githooks/pre-push`) until, for every project the push touches: gates 1+2
pass, PROJECT-LOG.md carries an entry in the same push (the learner loop), and front-end changes carry a
tree-fresh `visual-qa` pass stamp. Gate 3 cannot be scripted — the pre-push gate prints the reminder, the
reviewer run is on you.
