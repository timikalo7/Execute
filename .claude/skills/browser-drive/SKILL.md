---
name: browser-drive
description: >
  Drive a real browser (Playwright + the container's pre-installed Chromium) for ANY interactive web
  task — fill forms, click through flows, log in, scrape a JS-rendered/SPA page, exercise a live web
  app, reproduce a user bug, download something behind a click. Use whenever a task needs a browser
  doing things (not just screenshots — visual-qa and headless-screenshot-verify cover QA imaging;
  this is the general-purpose driving skill they're built on).
---

# browser-drive — general Playwright driving in this container

The container ships Chromium; nothing to install per-project. The recipe that works here:

```js
// drive.tmp.mjs — run from a directory whose node_modules has playwright
import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROME || "/opt/pw-browsers/chromium", // pinned-version mismatch-proof
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("https://target", { waitUntil: "domcontentloaded" });
// … page.fill / page.click / page.locator(...).innerText() / page.screenshot …
await browser.close();
```

Run: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node drive.tmp.mjs`

## Container gotchas (each one bit a real session)
- **ESM resolution:** `import "playwright"` resolves from the SCRIPT FILE's location, not cwd and
  not NODE_PATH — copy the script into the project that has playwright in node_modules (a dot-file
  like `.drive.tmp.mjs`, delete after) or `npm i --no-save playwright` there first.
- **Pinned-version trap:** a project's playwright may demand a browser build absent from
  /opt/pw-browsers (`Executable doesn't exist at …chromium_headless_shell-…`). Fix is the
  `executablePath: "/opt/pw-browsers/chromium"` above — never `npx playwright install`.
- **`--no-save` installs get pruned** by any later npm operation — reinstall right before use.
- **Never `pkill -f` your server pattern** — it matches your own command string (exit 144). Kill by
  pidfile or port.
- Outbound traffic goes through the agent proxy; TLS-impersonation tricks break (see tool-notes).
- Clean up: delete temp scripts, kill servers you started, and never leave `node_modules` at the
  repo root (it happened; it deleted a tracked lockfile on cleanup).

## Where the QA skills fit
`visual-qa` (gate: a11y/overflow/scenes) and `headless-screenshot-verify` (pixel proof) are
purpose-built layers on this same machinery — reach for them for QA; reach for THIS skill when the
browser has to *do* something.
