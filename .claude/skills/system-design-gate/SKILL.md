---
name: system-design-gate
description: >
  Runnable system-design gate — the mechanically-checkable slice of Execute's system-design +
  security master law, enforced at push time. Load/RUN whenever you change a project's code,
  dependencies, env handling, or server/API surface, and before any push. Checks: lockfile
  committed, no tracked .env, .env.example documents every non-public env var, TODO(keys) ⇒
  SETUP-KEYS.md, PROJECT-LOG.md exists, no string-built SQL, no auth tokens in localStorage;
  warns on missing rate-limit references and server fetch without timeout. FAILS (non-zero exit)
  on violations. The reasoning half (authz/IDOR/business-logic) is the security-reviewer agent.
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
---

# system-design-gate — check what a script CAN check, every time

Execute's system-design law lives in `memory/security-and-system-design-master.md` and
`memory/system-design-security-checklist.md`. Most of it needs reasoning (the `security-reviewer`
agent). But a slice is mechanical — and a mechanical rule that isn't runnable gets skipped.
This gate makes that slice block the push.

## Run

```bash
node .claude/skills/system-design-gate/check.mjs --dir projects/<name>
```

Exit 1 on any FAIL. Enforced automatically by the pre-push gate
(`.claude/hooks/pre-push-gate.sh`) for every project a push touches.

## What fails the push

| rule | why (master-law section) |
|---|---|
| `lockfile-missing` | reproducible builds, pinned deps (Part A: dependencies) |
| `committed-env-file` | no secrets in git (Part A) |
| `missing-env-example` | every non-public `process.env.X` documented (Part A + folder rules) |
| `missing-setup-keys` | `TODO(keys)` must pair with `SETUP-KEYS.md` (autonomy contract) |
| `missing-project-log` | the learner's substrate — no log, no learning loop |
| `sql-interpolation` | parameterized queries only (Part A: encode on output) |
| `token-in-localstorage` | XSS-exfiltratable auth storage (Part C: auth & sessions) |

Warnings (`no-rate-limit-reference`, `fetch-no-timeout`) don't block but must be reviewed —
they map to Part B (backpressure/quotas, timeouts on every remote call).

## What this gate is NOT

It cannot see authz gaps, IDOR, multi-tenant leaks, race conditions, or business-logic abuse.
Anything with a backend/API/auth/DB/payments/uploads still requires the **security-reviewer
agent** before shipping — the pre-push gate reminds you, but the reasoning pass is on you.
