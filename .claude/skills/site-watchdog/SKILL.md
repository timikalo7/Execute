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
