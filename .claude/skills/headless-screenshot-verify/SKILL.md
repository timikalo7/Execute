---
name: headless-screenshot-verify
description: Screenshot a running web app with headless Chromium (Playwright) to verify a UI change actually renders, before claiming it's done. Use whenever a visual/front-end change is made, the owner doubts something rendered, or you need pixel proof that a green build alone can't give. Especially for Next.js apps in this sandbox.
---

# Headless screenshot verify (pixel proof, not build proof)

A green `next build` proves compilation, not what the human sees: an image, font, or layout can silently fail to render while the build stays green — only a screenshot catches it. Make a screenshot the FIRST artifact after a visual change.

## When to use
- Any UI deliverable, before saying "done".
- Someone expresses doubt that something renders (show, don't tell).
- After swapping backgrounds, fonts, layout systems, or any taste-level change.

## Steps

1. **Install Playwright + Chromium (sandbox):**
   ```bash
   npm i --no-save playwright
   npx playwright install chromium      # lands in /opt/pw-browsers
   ```

2. **Build and start the app fresh.** For Next.js: `next start` serves the build SNAPSHOT captured at startup — new code/assets won't appear until you rebuild AND restart.
   ```bash
   npm run build
   PORT=4123 npm run start    # use a FRESH port each time (see trap below)
   ```
   Run the server in the background and wait for the port to be listening before capturing.

3. **Capture** with a throwaway script run under the right browsers path:
   ```bash
   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers NODE_PATH="$PWD/node_modules" node /tmp/shot.mjs
   ```
   In `/tmp/shot.mjs`: `chromium.launch()` → `newPage({viewport})` → `page.goto('http://localhost:4123', {waitUntil:'networkidle'})` → `page.screenshot({path, fullPage:true})`. Then Read the PNG to actually look at it.

4. **Look at the screenshot and confirm** the change is visible. Share it with the owner — this is what convinces, not a passing build.

## TRAP (cost me an exit-144 once)
- `pkill -f "next start"` ALSO matches your own shell command string and kills the calling process (exit 144). Do NOT pkill by pattern. Instead: kill by port, or just start each new server on a fresh port and screenshot that. Avoiding pkill entirely is the safe default here.
