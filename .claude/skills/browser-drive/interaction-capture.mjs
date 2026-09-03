#!/usr/bin/env node
/**
 * interaction-capture — drive a reference site through its INTERACTIVE states and photograph each.
 *
 * WHY. A clone built from scrolling screenshots copies a page's resting state and nothing else. The
 * owner's instruction, verbatim: "if i give u something to copy u have to interact with all its
 * features so u can copy it all". They are right, and the omission was expensive: unitedcarriers.com
 * was cloned from 34 static stills while its markup carries 48 menu-toggle, 16 accordion and 92 faq
 * references — a whole class of features that were never seen, let alone reproduced.
 *
 * Chromium in this container cannot reach the public internet directly, but Node's fetch can. So
 * every request the page makes is intercepted and served from Node — the same transport trick the
 * sibling external-site.mjs uses. Encoding matters: ask for identity, and strip content-encoding,
 * content-length and CSP off the response or the browser rejects what it is handed.
 *
 *   node interaction-capture.mjs <url> <outdir> [--viewport 1440x900]
 *
 * Writes one screenshot per state plus states.json describing what was done to produce it, so a
 * later build can be checked against behaviour rather than against a still.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

function resolveChromium() {
  const anchors = [];
  for (let d = process.cwd(); ; d = path.dirname(d)) {
    anchors.push(path.join(d, "package.json"));
    if (d === path.dirname(d)) break;
  }
  const here = path.dirname(new URL(import.meta.url).pathname);
  const projects = path.resolve(here, "../../..", "projects");
  if (fs.existsSync(projects))
    for (const p of fs.readdirSync(projects)) anchors.push(path.join(projects, p, "package.json"));
  for (const g of ["/opt/node22/lib/node_modules", "/usr/lib/node_modules"]) anchors.push(path.join(g, "x.js"));
  for (const a of anchors) { try { return createRequire(a)("playwright").chromium; } catch {} }
  return null;
}

/** Headers that must not survive the hop, or the browser refuses the body Node already decoded. */
export const STRIP_HEADERS = ["content-encoding", "content-length", "content-security-policy",
  "content-security-policy-report-only", "x-frame-options"];

export function cleanHeaders(h) {
  const out = {};
  for (const [k, v] of Object.entries(h || {})) {
    if (!STRIP_HEADERS.includes(k.toLowerCase())) out[k] = v;
  }
  return out;
}

/**
 * The states worth photographing, in the order a person would find them. Each is a probe: a set of
 * candidate selectors and what to do. Missing is fine and is recorded as missing — a state that is
 * absent from the reference is information, and reporting it as "captured" would be a lie.
 */
export const PROBES = [
  // The FIRST capture is the loading screen, deliberately. Discovered 2026-08-30: the site being
  // cloned opens on a full-screen preloader — a dot-matrix world map, a country list, a service list
  // and a percent counter — which no amount of scroll-screenshotting had ever revealed, because a
  // scroll capture starts after load. A preloader is a feature; photograph it before it goes.
  { id: "preload", how: "the loading screen, before the page has mounted", act: null, atLoad: true },
  { id: "rest", how: "the page at rest once loading has finished, nothing touched", act: null },
  // nearTop: these three are chrome/hero controls. Without the flag the capture happily matched a
  // button 6 screens down (the clone's `[class*=btn]` first matched an FAQ row) and screenshotted
  // THAT, so the reference panel showed a hero CTA and the clone panel showed an accordion. Two
  // different elements photographed at two different scroll positions is not a comparison.
  { id: "nav-open", how: "primary menu opened", nearTop: true,
    click: ["[class*=menu-toggle]", "[aria-label*=menu i]", "button[aria-expanded=false]", "[class*=burger]", "[class*=hamburger]"] },
  { id: "nav-link-hover", how: "hovering a primary nav link", nearTop: true,
    hover: ["nav a", "header a", "[class*=nav] a"] },
  { id: "cta-hover", how: "hovering the primary call to action", nearTop: true,
    hover: ["[class*=btn]", "[class*=button]", "a[class*=cta]", "button"] },
    // pointerIn exists because the reference site's FAQ rows are plain DIVs with cursor:pointer and
  // no button, no role and no aria — so every selector here matched zero, and the capture called a
  // 12-row accordion absent. There is no CSS selector for "the thing a user would click"; the only
  // honest signal is the cursor the site itself sets.
  { id: "faq-open", how: "an FAQ / accordion row opened", deep: true,
    // Three ways in, because no single one survives both sites. The reference names its classes
    // (`home-faq-main-item-title-wrap`) but ships no button; the clone ships real buttons with
    // aria-expanded but Tailwind class names with no word in them to match on. Matching only class
    // names called the clone's 12-row accordion absent — the same false-absence bug, third time.
    pointerIn: ["faq", "accordion", "question", "collapse"],
    click: ["button[aria-expanded]", "[role=button][aria-expanded]", "[aria-controls]",
            "[class*=accordion] button", "[class*=faq] button", "[class*=accordion] [role=button]",
            "summary", "[class*=faq] li"] },
  { id: "field-focus", how: "a form field focused", deep: true,
    focus: ["input[type=text]", "input[type=email]", "input:not([type=hidden])", "textarea"] },
];

/**
 * A `nearTop` probe means "the control that belongs to the header or the hero", and the only way to
 * say that mechanically is by where the element sits in the document. Two viewports is the band: it
 * covers a tall hero and a sticky header without reaching the next section.
 */
export const NEAR_TOP_BAND = 2;
export function withinTopBand(docTop, viewportH, bands = NEAR_TOP_BAND) {
  if (!Number.isFinite(docTop) || !Number.isFinite(viewportH) || viewportH <= 0) return false;
  return docTop >= 0 && docTop < viewportH * bands;
}

/**
 * A `deep` probe hunts for something that lives far down the page — an FAQ accordion, a contact
 * form. On a site that mounts sections as they enter the viewport, those nodes are simply not in the
 * DOM until something scrolls, so a probe that queries from the top gets zero matches and reports
 * "no matching element in the DOM". That message was wrong twice: the reference site carries 75
 * accordion elements and a form, and the capture called both absent because it never scrolled.
 *
 * Absence is a real, useful finding — but only when it is measured after the page has had the chance
 * to mount. So a deep probe scrolls the whole page first, returns to the top, and only then looks.
 */
export async function mountByScrolling(page, step = 600, settle = 60) {
  await page.evaluate(async ([st, ms]) => {
    const seen = new Set();
    for (let pass = 0; pass < 3; pass++) {
      const h = document.body.scrollHeight;
      if (seen.has(h)) break;          // height stopped growing: everything lazy has mounted
      seen.add(h);
      for (let y = 0; y < h; y += st) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, ms)); }
    }
    window.scrollTo(0, 0);
  }, [step, settle]);
  await page.waitForTimeout(900);
}

/**
 * Find the row a person would actually click inside an FAQ/accordion, when the markup gives no
 * handle to grab: no button, no role, no aria-expanded. The site's own `cursor: pointer` is the
 * only declaration of intent left, so use it — tag the node with a data attribute and hand the
 * caller a normal selector, which keeps the real-click path (and its actionability checks) intact
 * rather than falling straight to a dispatched event.
 *
 * Returns a selector string, or null when nothing in the DOM qualifies.
 */
export const POINTER_TAG = "data-capture-row";
export async function tagPointerRow(page, keywords) {
  const found = await page.evaluate(({ words, attr }) => {
    const re = new RegExp(words.join("|"), "i");
    const containers = [...document.querySelectorAll("*")].filter((e) => {
      if (re.test((e.className || "").toString())) return true;
      // A section that calls itself "F.A.Q" or "Questions" in its own heading is an FAQ regardless
      // of what its classes are named — utility-class frameworks leave nothing else to go on.
      const head = e.querySelector("h1,h2,h3,[class*=title],[class*=heading]");
      return !!head && re.test((head.textContent || "").trim().slice(0, 60));
    });
    for (const c of containers) {
      for (const el of c.querySelectorAll("*")) {
        const txt = (el.textContent || "").trim();
        if (txt.length < 4 || txt.length > 200) continue;             // a heading-sized label, not a whole section
        if (getComputedStyle(el).cursor !== "pointer") continue;
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.height < 10) continue;                  // not a decorative dot or an icon
        el.setAttribute(attr, "1");
        return true;
      }
    }
    return false;
  }, { words: keywords, attr: POINTER_TAG }).catch(() => false);
  return found ? `[${POINTER_TAG}]` : null;
}

export async function runProbe(page, probe, viewport) {
  if (!probe.act && !probe.click && !probe.hover && !probe.focus) return { done: true, note: "rest state" };
  if (probe.deep) { try { await mountByScrolling(page); } catch { /* a page that cannot scroll is still worth probing */ } }
  let clickSelectors = probe.click;
  if (probe.pointerIn) {
    const tagged = await tagPointerRow(page, probe.pointerIn);
    if (tagged) clickSelectors = [tagged, ...(probe.click || [])];   // the cursor beats the guess
  }
  const kinds = [["click", clickSelectors], ["hover", probe.hover], ["focus", probe.focus]];
  for (const [kind, selectors] of kinds) {
    if (!selectors) continue;
    for (const sel of selectors) {
      let loc = page.locator(sel).first();
      let n = 0;
      try { n = await page.locator(sel).count(); } catch { continue; }
      if (!n) continue;
      if (probe.nearTop) {
        // Pick the first match that actually lives in the header/hero band, not merely the first in
        // document order — a hidden nav can sort ahead of the visible one, and a generic button
        // selector matches the whole page.
        const idx = await page.locator(sel).evaluateAll((els, band) => {
          for (let i = 0; i < els.length; i++) {
            const r = els[i].getBoundingClientRect();
            const top = r.top + window.scrollY;
            if (r.width > 0 && r.height > 0 && top >= 0 && top < window.innerHeight * band) return i;
          }
          return -1;
        }, NEAR_TOP_BAND).catch(() => -1);
        if (idx < 0) continue;
        loc = page.locator(sel).nth(idx);
      }
      try {
        await loc.scrollIntoViewIfNeeded({ timeout: 3000 });
        if (kind === "click") await loc.click({ timeout: 4000 });
        if (kind === "hover") await loc.hover({ timeout: 4000 });
        if (kind === "focus") await loc.focus({ timeout: 4000 });
        await page.waitForTimeout(700);
        if (probe.nearTop) { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(250); }
        return { done: true, note: `${kind} on ${sel}` };
      } catch {
        /**
         * Playwright refuses to act on an element it judges unreachable, and on a real site that
         * judgement fires constantly for reasons that have nothing to do with the feature: a loading
         * overlay that never clears, a custom-cursor layer at z-index 100000, a control whose own
         * wrapper carries `pointer-events: none`. All three are true of the site being cloned, and
         * all three left the capture reporting "no matching element" for features that plainly exist.
         *
         * So fall back to dispatching the event on the node itself. This is less faithful than a
         * real click — it cannot be intercepted, so it does not prove a user could reach the control
         * — and the note says so, because a capture that overstates what it proved is worse than one
         * that fails honestly.
         */
        try {
          const ok = await loc.evaluate((el, k) => {
            if (!el) return false;
            const fire = (t) => el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
            if (k === "click") { fire("mouseover"); fire("mousedown"); fire("mouseup"); el.click?.(); fire("click"); }
            if (k === "hover") { fire("mouseover"); fire("mouseenter"); fire("mousemove"); }
            if (k === "focus") { el.focus?.(); el.dispatchEvent(new FocusEvent("focus", { bubbles: true })); }
            return true;
          }, kind);
          if (ok) {
            await page.waitForTimeout(900);
            if (probe.nearTop) { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(250); }
            return { done: true, dispatched: true, note: `${kind} DISPATCHED on ${sel} — the element was not reachable by a real pointer (overlay or pointer-events), so this proves the handler fires, not that a user can reach it` };
          }
        } catch { /* try the next candidate */ }
      }
    }
  }
  // Distinguish "not there" from "there but unreachable". The first version reported both as "no
  // matching element found", and that message was actively misleading: the site's nav, buttons and
  // FAQ rows were all present and simply covered by a loading overlay, so every click timed out on
  // an actionability check. A checker that cannot tell absent from blocked sends you looking in the
  // wrong place.
  let present = 0, inBand = 0;
  for (const [, selectors] of kinds) {
    if (!selectors) continue;
    for (const sel of selectors) {
      try { present += await page.locator(sel).count(); } catch {}
      if (!probe.nearTop) continue;
      // How many of those are actually in the band this probe searches? Without this the report
      // conflates "there are matches, but all of them are six screens down" with "there are matches
      // right here and something is covering them" — two findings that send you to opposite places.
      try {
        inBand += await page.locator(sel).evaluateAll((els, band) => els.filter((el) => {
          const r = el.getBoundingClientRect();
          const top = r.top + window.scrollY;
          return r.width > 0 && r.height > 0 && top >= 0 && top < window.innerHeight * band;
        }).length, NEAR_TOP_BAND).catch(() => 0);
      } catch {}
    }
  }
  /**
   * The three-way answer. This used to be two-way, and the missing branch actively misled: the
   * clone's CTA probe reported "8 matching elements EXIST but could not be interacted with —
   * something is covering them" for several rounds. Nothing was covering anything. The 8 were
   * <button> elements in an FAQ six screens down, matched page-wide by the fallback selector and
   * then correctly rejected by the top-band filter; the message described the wrong failure and
   * sent the investigation looking for an overlay that did not exist.
   */
  if (probe.nearTop && present > 0 && inBand === 0) {
    return { done: false, note: `${present} matching element(s) exist on the page but NONE within ${NEAR_TOP_BAND} viewports of the top, which is where this probe looks. Nothing is covering them — they are elsewhere. The page may simply have no such control in its header or hero. NOT CHECKED.` };
  }
  return present
    ? { done: false, note: `${present} matching element(s) EXIST${probe.nearTop ? ` (${inBand} of them in the top band)` : ""} but could not be interacted with — something is covering them, or they are not actionable. NOT CHECKED, not absent.` }
    : probe.deep
      ? { done: false, absent: true, note: "no matching element after scrolling the whole page to mount lazy sections — measured absence, not a skipped check" }
      : { done: false, note: "no matching element in the DOM — NOT CHECKED, not proof of absence" };
}

function selftest() {
  const checks = [];
  const t = (n, c) => checks.push({ n, ok: !!c });
  t("strips content-encoding", !("content-encoding" in cleanHeaders({ "content-encoding": "gzip", "x-a": "1" })));
  t("strips it case-insensitively", !("Content-Encoding" in cleanHeaders({ "Content-Encoding": "br" })));
  t("strips CSP so the rehosted page can run", !("content-security-policy" in cleanHeaders({ "content-security-policy": "default-src 'none'" })));
  t("keeps everything else", cleanHeaders({ "content-type": "text/html" })["content-type"] === "text/html");
  t("survives null headers", Object.keys(cleanHeaders(null)).length === 0);
  // Updated when the preloader was discovered: the loading screen is now captured BEFORE rest,
  // because it is only visible for a moment and it is a real feature of the page.
  t("the loading screen is captured first, before it disappears", PROBES[0].id === "preload");
  t("rest comes straight after, as the untouched baseline", PROBES[1].id === "rest");
  t("only the preload probe runs before the page has mounted", PROBES.filter((p) => p.atLoad).length === 1);
  t("every probe explains itself in prose", PROBES.every((p) => p.how && p.how.length > 8));
  t("every probe has a unique id", new Set(PROBES.map((p) => p.id)).size === PROBES.length);
  t("probes cover menu, hover, accordion and form", ["nav-open", "cta-hover", "faq-open", "field-focus"].every((id) => PROBES.some((p) => p.id === id)));
  t("header/hero controls are constrained to the top band", ["nav-open", "nav-link-hover", "cta-hover"].every((id) => PROBES.find((p) => p.id === id).nearTop));
  t("the FAQ probe is NOT constrained — it genuinely lives down the page", !PROBES.find((p) => p.id === "faq-open").nearTop);
  t("an element in the first viewport is in the band", withinTopBand(100, 900));
  t("an element just inside two viewports is in the band", withinTopBand(1799, 900));
  // The must-fail half: a band check that only ever returns true would have let the FAQ button
  // through and reproduced the exact bug this flag exists to stop.
  t("an element six screens down is NOT in the band", !withinTopBand(5400, 900));
  t("an element exactly two viewports down is NOT in the band", !withinTopBand(1800, 900));
  t("a negative offset is NOT in the band", !withinTopBand(-10, 900));
  t("a nonsense viewport is NOT in the band", !withinTopBand(100, 0) && !withinTopBand(100, NaN));
  t("the FAQ and form probes scroll the page before deciding nothing is there", ["faq-open", "field-focus"].every((id) => PROBES.find((p) => p.id === id).deep));
  t("the FAQ probe falls back to the site's own cursor when the markup gives no handle", Array.isArray(PROBES.find((p) => p.id === "faq-open").pointerIn));
  t("the FAQ probe can also find a real button by its aria state", PROBES.find((p) => p.id === "faq-open").click.includes("button[aria-expanded]"));
  t("the cursor fallback is only used where markup is unreliable, not everywhere", PROBES.filter((p) => p.pointerIn).length === 1);
  t("the header/hero probes do NOT scroll the page away", ["nav-open", "nav-link-hover", "cta-hover"].every((id) => !PROBES.find((p) => p.id === id).deep));
  // The band arithmetic behind the three-way answer, exercised directly.
  t("an in-band element counts toward inBand", withinTopBand(500, 900));
  t("a far element counts toward present but NOT inBand", !withinTopBand(28000, 900));
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) console.log(`${c.ok ? "ok  " : "FAIL"} ${c.n}`);
  console.log(`\n${checks.length - failed.length}/${checks.length} assertions passed`);
  return failed.length ? 1 : 0;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) process.exit(selftest());
  const [url, out] = argv;
  if (!url || !out) { console.error("usage: interaction-capture.mjs <url> <outdir> [--viewport WxH]"); process.exit(2); }
  const vArg = argv.includes("--viewport") ? argv[argv.indexOf("--viewport") + 1] : "1440x900";
  const [width, height] = vArg.split("x").map(Number);

  const chromium = resolveChromium();
  if (!chromium) { console.error("NOT CHECKED — playwright is not resolvable"); process.exit(4); }
  const exe = fs.existsSync("/opt/pw-browsers")
    ? fs.readdirSync("/opt/pw-browsers").filter((d) => d.startsWith("chromium"))
        .map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find((p) => fs.existsSync(p))
    : undefined;

  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage({ viewport: { width, height } });

  await page.route("**/*", async (route) => {
    const req = route.request();
    // Every request round-trips through Node, which is slow enough that a progress-gated preloader
    // may never reach 100%. Video, audio and fonts are not what an interaction capture is for, so
    // they are refused rather than waited on. Measured: with media allowed, the counter on the site
    // being cloned sat at 33-70% indefinitely and the page never mounted.
    if (["media", "font"].includes(req.resourceType())) { try { await route.abort(); } catch {} return; }
    try {
      const res = await fetch(req.url(), {
        method: req.method(),
        headers: { ...req.headers(), "accept-encoding": "identity" },
        body: ["GET", "HEAD"].includes(req.method()) ? undefined : req.postDataBuffer(),
        redirect: "follow",
      });
      const buf = Buffer.from(await res.arrayBuffer());
      await route.fulfill({ status: res.status, headers: cleanHeaders(Object.fromEntries(res.headers)), body: buf });
    } catch {
      try { await route.abort(); } catch { /* the route may already be gone */ }
    }
  });

  const states = [];
  let mounted = false;
  let loaderLifted = [];
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1200);   // early enough to still see a preloader

    /**
     * Wait for the real page. The first version of this probed 3s after DOMContentLoaded and matched
     * nothing at all — not because the selectors were wrong but because the site was still showing
     * its loading screen. "No matching element" from a page that has not mounted yet is a statement
     * about the timing, not about the page.
     */
    const ready = () => page.evaluate(() =>
      document.querySelectorAll("nav a, header a").length + document.querySelectorAll("button").length > 2);

    /**
     * Wait for the real page — and if a loading screen refuses to finish, LIFT IT.
     *
     * A progress-gated preloader counts assets, and every request here round-trips through Node
     * because Chromium cannot reach the internet directly. On the site being cloned the counter sat
     * between 33% and 70% across three attempts, including one with media and fonts aborted and a
     * 180-second budget, so the page never mounted and every interaction probe reported "no matching
     * element" — a statement about timing, not about the page.
     *
     * The page's real content is usually already in the DOM behind the overlay. So after a bounded
     * wait, find the full-viewport fixed/absolute layer sitting on top and remove it, then check
     * whether the content underneath is reachable. This is a DELIBERATE modification of the page and
     * it is recorded in states.json as `loaderLifted`, because a capture that quietly edits its
     * subject and does not say so is worse than one that fails.
     */
    const settled = async () => {
      try {
        await page.waitForFunction(() => {
          const links = document.querySelectorAll("nav a, header a").length;
          const buttons = document.querySelectorAll("button").length;
          return links + buttons > 2;
        }, null, { timeout: 45000 });
        return true;
      } catch { /* fall through to lifting the overlay */ }

      loaderLifted = await page.evaluate(() => {
        const vw = innerWidth, vh = innerHeight;
        const covers = [...document.querySelectorAll("body *")].filter((el) => {
          const cs = getComputedStyle(el);
          if (cs.position !== "fixed" && cs.position !== "absolute") return false;
          if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return false;
          const r = el.getBoundingClientRect();
          const big = r.width >= vw * 0.9 && r.height >= vh * 0.9;
          // Geometry alone missed the real case: the loader on the site being cloned is a
          // full-screen layer that does not start exactly at 0,0, so a `top <= 2` test skipped it
          // and nothing was lifted. Name-matching catches it; the geometry test still catches
          // overlays that are not conventionally named.
          const named = /loader|preload|splash|intro|overlay|curtain|transition|\btrans\b/i.test(el.className + " " + el.id);
          return big && (named || (r.top <= 2 && r.left <= 2));
        });
        // Topmost first: the overlay is the one painted last / highest.
        covers.sort((a, b) => (+getComputedStyle(b).zIndex || 0) - (+getComputedStyle(a).zIndex || 0));
        const removed = [];
        for (const el of covers.slice(0, 3)) { removed.push(el.className || el.tagName); el.remove(); }
        document.documentElement.style.overflow = "auto";
        document.body.style.overflow = "auto";
        return removed;
      });
      await page.waitForTimeout(1200);
      return await ready();
    };

    for (const probe of PROBES) {
      if (!probe.atLoad && !mounted) mounted = await settled();
      const r = await runProbe(page, probe, { width, height });
      /**
       * Lift any loading overlay AGAIN, immediately before the shot.
       *
       * `settled()` runs after a reload, but the reference's preloader is progress-gated on asset
       * loading and every request here round-trips through Node, so it can still be counting — or
       * re-appear as a page-transition curtain (`trans-circ anim-wave`) — by the time the probe has
       * finished acting. The result was a `nav-open` frame in which the menu HAD opened, proven by
       * the real click that opened it, photographed behind a loading screen showing 67%. The state
       * was reached and the picture of it was of something else.
       *
       * Skipped for the `preload` probe, whose entire purpose is to photograph that overlay.
       */
      if (!probe.atLoad) { try { await settled(); } catch { /* nothing to lift */ } }
      /**
       * Was the page STILL LOADING when this was photographed?
       *
       * Lifting an overlay only helps when the loading screen is an overlay. On the reference it is
       * not — the preloader IS the page before it mounts, and it is gated on asset progress. Every
       * request in this capture round-trips through Node, so that counter stalls: measured at 59%,
       * 67% and 63% on three runs of the same page, never reaching 100. A click probe reloads, and
       * the reload starts the whole thing again.
       *
       * There is no fix for that here — it is the transport, not the page. What there IS a fix for
       * is reporting it. A state photographed mid-load is recorded as such, so a comparison built
       * from these frames can label it instead of presenting a loading screen as a menu.
       */
      const duringPreload = await page.evaluate(() => {
        const t = document.body.innerText || "";
        const counter = /\b(\d{1,2})\s*%?\s*$/m.test(t.slice(-400));
        const cover = [...document.querySelectorAll("div,section")].some((e) => {
          const r = e.getBoundingClientRect();
          return /loader|preload|splash|intro|curtain|\btrans\b/i.test(e.className + " " + e.id)
            && r.width > innerWidth * 0.85 && r.height > innerHeight * 0.85
            && getComputedStyle(e).opacity !== "0" && getComputedStyle(e).display !== "none";
        });
        return counter || cover;
      }).catch(() => false);
      const file = path.join(out, `${probe.id}.jpg`);
      await page.screenshot({ path: file, type: "jpeg", quality: 82 });
      const scrollY = await page.evaluate(() => Math.round(window.scrollY)).catch(() => null);
      states.push({ id: probe.id, how: probe.how, captured: r.done, dispatched: !!r.dispatched, absent: !!r.absent, duringPreload, note: r.note, scrollY, file });
      console.log(`${r.done ? "ok  " : "MISS"} ${probe.id.padEnd(16)}${duringPreload && !probe.atLoad ? " [SHOT DURING PRELOAD]" : ""} ${r.note}`);
      /**
       * A click probe reloads the page, which brings the PRELOADER BACK — and a fixed 1200 ms wait
       * is not a mount. On the reference at 390x844 the loading screen is still counting when the
       * next probe fires, so `nav-open` was photographed against a preloader and the comparison for
       * that state was meaningless. Wait for the loader to actually go, with a cap, instead of
       * guessing a duration that happens to work at one viewport on one connection.
       */
      if (probe.click) {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => {
          const el = [...document.querySelectorAll("div,section,aside")].find((e) => {
            const r = e.getBoundingClientRect();
            const named = /loader|preload|splash|intro|curtain/i.test(e.className + " " + e.id);
            return named && r.width > innerWidth * 0.8 && r.height > innerHeight * 0.8;
          });
          return !el || getComputedStyle(el).opacity === "0" || getComputedStyle(el).display === "none";
        }, null, { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(1200);
        mounted = await settled();
      }
    }
  } finally {
    fs.writeFileSync(path.join(out, "states.json"), JSON.stringify({ url, viewport: vArg, loaderLifted, states }, null, 2));
    await browser.close();
  }
  // A state the page does not have and a state the capture failed to reach are different results,
  // and rolling them into one "NOT CHECKED" list hid a measured absence behind a skipped check.
  const absent = states.filter((s) => !s.captured && s.absent).map((s) => s.id);
  const missed = states.filter((s) => !s.captured && !s.absent).map((s) => s.id);
  console.log(`\n${states.filter((s) => s.captured).length}/${states.length} states captured` +
    (absent.length ? `; ABSENT (measured, after mounting the page): ${absent.join(", ")}` : "") +
    (missed.length ? `; NOT CHECKED: ${missed.join(", ")}` : ""));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(3); });
