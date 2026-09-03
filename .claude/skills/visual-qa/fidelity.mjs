#!/usr/bin/env node
/**
 * fidelity — does the built page actually LOOK like the reference it was built from?
 *
 * Why this exists, in the owner's words: *"the fact that the evaluator looked at that site and what
 * u made and passed is really bad."* It is the correct complaint. `visual-qa` checks contrast,
 * overflow, console errors, keyboard reach and axe. Every one of those passed on a page that did
 * not resemble its reference at all, because **not one of them measures resemblance**. A gate that
 * greenlights a tree a human rejects on sight is a bug in the gate
 * (`memory/agent-graph-engineering.md`: check the checker).
 *
 * So this loads BOTH pages in the same browser at the same viewport and diffs measurable design
 * properties. It is not a pixel diff — the pages have different content and should. It measures the
 * things that decide whether two pages belong to the same visual world:
 *
 *   1. GLYPH WIDTH RATIO of the display face — condensed vs normal. The single most decisive
 *      number: a condensed grotesque runs ~0.55-0.65 em per capital, a normal one ~0.72+.
 *   2. DISPLAY SCALE — largest heading size as a share of viewport width.
 *   3. CASE and WEIGHT of the display face.
 *   4. GROUND RANGE — does the page actually use both near-white and near-black full-width bands?
 *   5. SUBJECT FILL — how much of the opening frame the subject occupies. A reference whose subject
 *      fills the frame and a build whose subject floats in empty space are not the same design,
 *      however correct the mechanics underneath.
 *
 *   node fidelity.mjs --ref <url> --built <url> [--fail]
 *   node fidelity.mjs --selftest
 *
 * External URLs are fetched through Node and fulfilled into the browser, because Chromium here
 * cannot open an external connection (see browser-drive/external-site.mjs).
 */

import fs from "node:fs";

export const TOLERANCE = {
  glyphRatio: 0.06,   // absolute difference in em-width per capital
  displayScale: 0.35, // relative difference, generous — content differs legitimately
  subjectFill: 0.5,   // relative difference in share-of-frame
};

/** Metrics that can be read from any page's own DOM, no pixel work. */
export const PROBE = () => {
  const px = (v) => parseFloat(v) || 0;

  // 1. Glyph width ratio for whatever face the biggest heading actually resolves to.
  const heads = [...document.querySelectorAll("h1,h2,h3")]
    .map((h) => ({ h, size: px(getComputedStyle(h).fontSize) }))
    .filter((x) => x.size > 0)
    .sort((a, b) => b.size - a.size);
  const top = heads[0];

  let glyphRatio = null, displayFamily = null, weight = null, transform = null, tracking = null, probeResolved = null;
  if (top) {
    const cs = getComputedStyle(top.h);
    displayFamily = cs.fontFamily;
    weight = cs.fontWeight;
    transform = cs.textTransform;
    tracking = px(cs.letterSpacing) / px(cs.fontSize) || 0;
    // Set the font properties INDIVIDUALLY, never by concatenating into cssText. A computed
    // font-family comes back as `"Archivo Var", "Helvetica Neue", …` — quotes and all — and
    // interpolating that into a cssText string produces a declaration the parser drops, so the
    // probe silently falls through to a default face. That is exactly what happened here: the probe
    // reported 0.722 (plain Helvetica) for a heading that was demonstrably rendering in Archivo,
    // and the number was acted on. An evaluator measuring the wrong thing is worse than no
    // evaluator, because its output is believed.
    const probe = document.createElement("span");
    probe.textContent = "HHHHHHHHHH";
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.whiteSpace = "pre";
    probe.style.fontSize = "100px";
    probe.style.letterSpacing = "0";
    probe.style.fontFamily = cs.fontFamily;
    probe.style.fontWeight = cs.fontWeight;
    probe.style.fontStretch = cs.fontStretch;
    document.body.appendChild(probe);
    // Confirm the probe resolved to the family we asked for rather than to a fallback.
    probeResolved = probe.style.fontFamily === cs.fontFamily;
    glyphRatio = probe.getBoundingClientRect().width / 10 / 100;
    probe.remove();
  }

  // 2. Display scale: biggest heading against viewport width.
  const displayScale = top ? top.size / window.innerWidth : 0;

  // 3/4. Ground range: luminance of full-width section backgrounds.
  const lum = (c) => {
    const m = String(c).match(/[\d.]+/g);
    if (!m || m.length < 3) return null;
    const [r, g, b] = m.map(Number).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const grounds = [...document.querySelectorAll("section,header,footer,div")]
    .filter((el) => el.getBoundingClientRect().width >= window.innerWidth * 0.92 && el.getBoundingClientRect().height > 200)
    .map((el) => lum(getComputedStyle(el).backgroundColor))
    .filter((v) => v !== null && v >= 0);
  const lightest = grounds.length ? Math.max(...grounds) : null;
  const darkest = grounds.length ? Math.min(...grounds) : null;

  // 5. Subject fill: the largest image-ish element in the first two screens.
  const frame = window.innerWidth * window.innerHeight;
  const subjects = [...document.querySelectorAll("img,svg,video,canvas")]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.top < window.innerHeight * 2 && r.width > 40 && r.height > 40)
    .map((r) => (Math.min(r.width, window.innerWidth) * Math.min(r.height, window.innerHeight)) / frame);
  const subjectFill = subjects.length ? Math.max(...subjects) : 0;

  return { glyphRatio, displayFamily, weight, transform, tracking, displayScale, lightest, darkest, subjectFill, probeResolved };
};

export function compare(ref, built, tol = TOLERANCE) {
  const findings = [];
  // A measurement taken through a fallback font is not a measurement. Say so instead of comparing.
  if (ref.probeResolved === false || built.probeResolved === false) {
    findings.push({ id: "probe-unresolved", detail: "the width probe fell back to a different font on one of the pages — the glyph numbers below cannot be trusted and no width comparison was made" });
    return findings;
  }
  const rel = (a, b) => (a === 0 ? (b === 0 ? 0 : 1) : Math.abs(a - b) / Math.abs(a));

  if (ref.glyphRatio != null && built.glyphRatio != null) {
    const d = Math.abs(ref.glyphRatio - built.glyphRatio);
    if (d > tol.glyphRatio)
      findings.push({
        id: "display-width",
        detail: `display face is ${built.glyphRatio > ref.glyphRatio ? "WIDER" : "narrower"} than the reference — ${built.glyphRatio.toFixed(3)} em/cap vs ${ref.glyphRatio.toFixed(3)} (Δ${d.toFixed(3)}). This is the voice of the page; getting it wrong makes everything else look wrong too.`,
      });
  }
  if (ref.transform !== built.transform)
    findings.push({ id: "display-case", detail: `display case is "${built.transform}", reference is "${ref.transform}"` });

  if (rel(ref.displayScale, built.displayScale) > tol.displayScale)
    findings.push({
      id: "display-scale",
      detail: `largest heading is ${(built.displayScale * 100).toFixed(1)}% of viewport width, reference is ${(ref.displayScale * 100).toFixed(1)}%`,
    });

  if (ref.lightest != null && built.lightest != null) {
    if (ref.lightest > 0.75 && built.lightest < 0.6)
      findings.push({ id: "ground-light", detail: `reference uses a near-white ground (${ref.lightest.toFixed(2)}), build's lightest is ${built.lightest.toFixed(2)}` });
    if (ref.darkest < 0.08 && built.darkest > 0.2)
      findings.push({ id: "ground-dark", detail: `reference uses a near-black ground (${ref.darkest.toFixed(2)}), build's darkest is ${built.darkest.toFixed(2)}` });
  }

  if (rel(ref.subjectFill, built.subjectFill) > tol.subjectFill)
    findings.push({
      id: "subject-fill",
      detail: `subject occupies ${(built.subjectFill * 100).toFixed(1)}% of the opening frame, reference ${(ref.subjectFill * 100).toFixed(1)}% — a subject floating in empty space is not the same design as one that fills it`,
    });

  return findings;
}

/* --------------------------------------------------------------------------- selftest */

function selfTest() {
  let pass = 0, fail = 0;
  const check = (ok, what) => { ok ? pass++ : (fail++, console.log(`  FAIL  ${what}`)); };
  const base = { glyphRatio: 0.58, transform: "uppercase", displayScale: 0.06, lightest: 0.95, darkest: 0.02, subjectFill: 0.42 };

  check(compare(base, { ...base }).length === 0, "identical metrics produce no findings");
  check(compare(base, { ...base, glyphRatio: 0.74 }).some((f) => f.id === "display-width"),
    "a normal-width face against a condensed reference is caught");
  check(compare(base, { ...base, glyphRatio: 0.60 }).length === 0,
    "a small width difference is within tolerance — this must not fire on every font");
  check(compare(base, { ...base, transform: "none" }).some((f) => f.id === "display-case"),
    "losing the uppercase treatment is caught");
  check(compare(base, { ...base, displayScale: 0.02 }).some((f) => f.id === "display-scale"),
    "a headline a third the reference's size is caught");
  check(compare(base, { ...base, lightest: 0.1 }).some((f) => f.id === "ground-light"),
    "a dark build against a light reference is caught");
  check(compare(base, { ...base, darkest: 0.5 }).some((f) => f.id === "ground-dark"),
    "a build with no black band against a reference that has one is caught");
  check(compare(base, { ...base, subjectFill: 0.05 }).some((f) => f.id === "subject-fill"),
    "a subject floating in empty space is caught");
  check(compare(base, { ...base, subjectFill: 0.35 }).length === 0,
    "a modest subject-size difference is within tolerance");
  check(typeof PROBE === "function", "the probe is a plain function so it can be evaluated in-page");

  // The guard added after the probe was caught measuring a fallback font and its number was acted on.
  const unresolved = compare({ ...base, probeResolved: false }, { ...base, probeResolved: true });
  check(unresolved.length === 1 && unresolved[0].id === "probe-unresolved",
    "an unresolved probe reports itself and REFUSES to compare, instead of quietly returning a wrong width");
  check(compare({ ...base, probeResolved: true }, { ...base, glyphRatio: 0.74, probeResolved: true })
    .some((f) => f.id === "display-width"),
    "a resolved probe still compares normally");

  console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — fidelity: ${pass} passed, ${fail} failed`);
  return fail;
}

/* --------------------------------------------------------------------------- cli */

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) process.exit(selfTest() ? 1 : 0);

  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const REF = arg("--ref"), BUILT = arg("--built");
  if (!REF || !BUILT) { console.error("usage: fidelity.mjs --ref <url> --built <url> [--fail]"); process.exit(2); }

  /*
   * This file lives in .claude/skills/, which has no node_modules. ESM resolves bare specifiers
   * from the MODULE's location rather than the working directory, so `import("playwright")` fails
   * here however you invoke it. Resolve it from a project that actually has it, and say plainly
   * which one — an evaluator that cannot start must not look like an evaluator that passed.
   */
  const { createRequire } = await import("node:module");
  const path = await import("node:path");
  /*
   * Anchor on the REPO ROOT (derived from this file's own location) as well as the working
   * directory. The gate runs this from inside a project, where a cwd-relative "projects/x" path
   * does not exist — so the first version reported "playwright not resolvable" from a checkout that
   * plainly had it, and the step failed for a reason that had nothing to do with the page.
   */
  const here = path.dirname(new URL(import.meta.url).pathname);
  const repoRoot = path.resolve(here, "../../..");
  // Enumerate projects/* rather than naming them: a hardcoded list only resolves in the repo it was
  // written in, and silently reports "playwright not resolvable" in every other one.
  const projectDirs = (root) => {
    try { return fs.readdirSync(path.join(root, "projects"), { withFileTypes: true })
      .filter((d) => d.isDirectory()).map((d) => path.join("projects", d.name)); }
    catch { return []; }
  };
  const roots = [
    path.resolve(process.cwd(), "package.json"),
    ...[...new Set([...projectDirs(repoRoot), ...projectDirs(process.cwd())])].flatMap((r) => [
      path.resolve(repoRoot, r, "package.json"),
      path.resolve(process.cwd(), r, "package.json"),
    ]),
  ].filter((p) => fs.existsSync(p));
  // playwright is CJS: importing its resolved path gives the module under `default`, not as named
  // exports, so `.chromium` is undefined and the whole thing silently falls through to "not
  // resolvable". Using the require() that createRequire hands back avoids the interop entirely.
  let chromium, resolvedFrom;
  for (const r of roots) {
    try { chromium = createRequire(r)("playwright").chromium; resolvedFrom = r; break; } catch { /* try the next */ }
  }
  if (chromium) console.log(`(playwright resolved from ${path.relative(process.cwd(), resolvedFrom)})`);
  if (!chromium) {
    console.error("playwright not resolvable from any project under projects/ — run `npm ci` in one of them");
    process.exit(3);
  }
  // Filter by the BINARY existing, not by the directory name matching. /opt/pw-browsers contains a
  // bare `chromium` entry alongside the versioned ones, and taking the first name-match handed
  // Playwright a path with no executable behind it.
  const exe = ["/opt/pw-browsers"]
    .flatMap((d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((x) => x.startsWith("chromium")).map((x) => `${d}/${x}/chrome-linux/chrome`) : []))
    .concat(process.env.PW_CHROMIUM ? [process.env.PW_CHROMIUM] : [])
    .find((p) => fs.existsSync(p));
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});

  async function measure(url, viaNode) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    if (viaNode) {
      await ctx.route("**/*", async (route) => {
        const req = route.request();
        try {
          const r = await fetch(req.url(), { method: req.method(), headers: { ...req.headers(), "accept-encoding": "identity" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
          const body = Buffer.from(await r.arrayBuffer());
          const headers = {};
          r.headers.forEach((v, k) => { if (!["content-encoding", "content-length", "content-security-policy", "content-security-policy-report-only"].includes(k)) headers[k] = v; });
          await route.fulfill({ status: r.status, headers, body });
        } catch { try { await route.abort(); } catch {} }
      });
    }
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(viaNode ? 9000 : 3000);
    const m = await page.evaluate(PROBE);
    await ctx.close();
    return m;
  }

  /*
   * A reference's metrics are captured ONCE and committed, so the push gate compares against a file
   * instead of fetching a third-party site on every push. A gate that depends on someone else's
   * server being up is a gate that gets disabled the first week it flakes.
   */
  const refIsFile = REF.endsWith(".json");
  let ref;
  if (refIsFile) {
    ref = JSON.parse(fs.readFileSync(REF, "utf8")).metrics;
    console.log(`(reference metrics loaded from ${REF})`);
  } else {
    ref = await measure(REF, /^https?:\/\/(?!localhost|127\.)/.test(REF));
    const out = arg("--save-ref");
    if (out) {
      fs.writeFileSync(out, JSON.stringify({ _source: REF, captured: new Date().toISOString().slice(0, 10), metrics: ref }, null, 2) + "\n");
      console.log(`(reference metrics saved to ${out})`);
    }
  }
  const built = await measure(BUILT, false);
  await browser.close();

  const show = (label, m) => {
    console.log(`\n${label}`);
    console.log(`  glyph width   ${m.glyphRatio?.toFixed(3) ?? "?"} em/cap`);
    console.log(`  display scale ${(m.displayScale * 100).toFixed(1)}% of viewport width`);
    console.log(`  case/weight   ${m.transform} / ${m.weight}`);
    console.log(`  grounds       lightest ${m.lightest?.toFixed(2) ?? "?"}  darkest ${m.darkest?.toFixed(2) ?? "?"}`);
    console.log(`  subject fill  ${(m.subjectFill * 100).toFixed(1)}% of the opening frame`);
    console.log(`  family        ${String(m.displayFamily).slice(0, 70)}`);
    console.log(`  probe resolved ${m.probeResolved}`);
  };
  show("REFERENCE", ref);
  show("BUILT", built);

  const findings = compare(ref, built);
  console.log("");
  if (!findings.length) console.log("RESULT: pass — the build is in the same visual world as its reference.");
  else {
    console.log(`FIDELITY FINDINGS (${findings.length}):`);
    for (const f of findings) console.log(`  ${f.id.padEnd(14)} ${f.detail}`);
    console.log(`\nRESULT: ${argv.includes("--fail") ? "FAIL" : "advisory"} — ${findings.length} way(s) in which this does not look like what it was built from.`);
  }
  process.exit(argv.includes("--fail") && findings.length ? 1 : 0);
}
