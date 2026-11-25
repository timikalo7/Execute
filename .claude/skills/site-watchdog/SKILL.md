---
name: site-watchdog
description: >
  Daily health check for LIVE, launched sites — uptime, security-header drift, TLS cert expiry,
  homepage defacement/blank-page detection. Load when a project launches to production, when
  adding monitoring, or when asked "is the site up / healthy / still secure". Config-driven:
  drop a watchdog.json in the project dir and the daily GitHub Actions cron picks it up
  automatically; failures open a GitHub issue. Runnable locally too.
allowed-tools:
  - Bash
  - Read
  - Write
---

# site-watchdog — a launched site nobody watches is a risk

Certs expire. Hosts silently drop custom headers. A bad deploy blanks the homepage. All invisible
until a visitor (or an attacker) finds them first. This makes the checks mechanical and daily.

## Wire a new site (once, at launch)

1. Create `projects/<name>/watchdog.json`:
   ```json
   {
     "url": "https://example.org",
     "routes": ["/", "/about"],
     "marker": "Expected homepage text",
     "headers": ["strict-transport-security", "content-security-policy", "x-frame-options",
                  "x-content-type-options", "referrer-policy"],
     "minCertDays": 21
   }
   ```
2. Done. `.github/workflows/watchdog.yml` loops over every `projects/*/watchdog.json` daily at
   07:00 UTC; any failure opens (or comments on) a GitHub issue with the full report.

## Run locally

```bash
node .claude/skills/site-watchdog/check.mjs --config projects/example-marketing-site/watchdog.json
```

Exit 1 on failure. Honors `HTTPS_PROXY` (curl natively; openssl via `-proxy`).

## What fails it

- any configured route not answering HTTP 200
- homepage missing the `marker` text (defacement / blank-page tell)
- a required security header absent on `/` (header drift after host/config changes)
- TLS cert with fewer than `minCertDays` days left

Slow responses (> `slowMs`, default 4s) warn without failing.

## Notes

- Checks the PUBLIC surface only — no credentials, nothing invasive, read-only GETs.
- Pairs with the launch checklist: wiring the watchdog.json is a launch step, not an afterthought.

## Three verdicts, not two — added 2026-08-28 after a three-day false alarm

`check.mjs` exits **0 pass · 1 the SITE is failing · 3 NOT CHECKED**, and the workflow
raises a different issue for each of the last two.

**Why:** an issue sat open for three days claiming a watched site was down
across six checks. The site was serving **200 on every route the whole time**. Every
failure line read `request failed (Command failed: curl …)` — that is curl never opening a
socket, not the site answering badly. The runner almost certainly had no IPv6 route, and
the site is **IPv6-only**.

**A monitor that reports its own blindness as an outage is worse than no monitor**, because
you learn to close its issues without reading them. That is evaluator decay
(`memory/agent-graph-engineering.md` §3) in its most literal form.

**How the two are now told apart:** a **control host** (`controlUrl`, default
`https://example.com/`). If the control answers and the target does not, the target is
genuinely down → FAIL. If neither answers, the watchdog is blind → NOT CHECKED, and the
site is reported as untested rather than as broken.

Each request also retries across IP families (`auto → -4 → -6`) before giving up, which
would have made this particular failure a non-event.

**Transport codes are measured, not remembered.** The set is `5, 6, 7, 28, 35, 52, 55, 56`.
**56 was found by running curl here** — behind this container's agent proxy an unreachable
host returns `curl: (56) CONNECT tunnel failed, response 502`, and the first version of the
fix omitted it, so the no-network test still reported FAIL. A list assembled from memory is
a list with holes in it.

**Proven in all three directions:**

| scenario | result | exit |
|---|---|---|
| the real site | `pass` — 5 routes 200, headers present, cert 71 days | 0 |
| unreachable target, control **reachable** | `FAIL` — *"the control host WAS reachable, so this is the site"* | 1 |
| unreachable target, control **unreachable** | `NOT CHECKED` — *"this is a watchdog/runner problem, not a site problem"* | 3 |

