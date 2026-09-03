#!/usr/bin/env node
/**
 * judge-frames — prepare the two frame sets a design judge needs, and print the brief to hand it.
 *
 * WHY THIS EXISTS. `video-judge.mjs` asks an OpenAI-compatible vision endpoint whether the build
 * belongs to the reference's visual world, and correctly refuses to pass when no key is configured.
 * The consequence went unnoticed for a long time: leg 3 of the design loop had NEVER RUN, and the
 * owner kept being asked for a key while four iterations shipped with the only check that can
 * answer their actual question sitting permanently at NOT CHECKED.
 *
 * The key was never the requirement. The requirement is an evaluator that can see images and has no
 * stake in the build. A FRESH SUB-AGENT satisfies both: spawn it with these two files and the brief
 * below, and it has never seen the code, the git history or the builder's account of its own work.
 * That is exactly what `memory/agent-graph-engineering.md` asks for — evaluators judge the ARTIFACT,
 * never the builder's reasoning — and it needs no credential at all.
 *
 * The honest limitation, which must be stated wherever the verdict is: a sub-agent is the same model
 * family that wrote the code, so it shares some blind spots. An external model is still better and
 * `video-judge.mjs` remains the path for one. But "same family, fresh context" beats "not checked",
 * and the first run of this found five outright rendering bugs — clipped text, a double-printed
 * footer line, a checkerboard placeholder strip — that four numeric checks had all missed.
 *
 *   node judge-frames.mjs --ref-dir <slices> --sheet <contact-sheet.jpg> --out <dir> [--frames 12]
 *
 * `--sheet` is the composite written by contact-sheet.mjs; the build frames are cut from its right
 * column, so both sets come from the same capture and are sampled at matching positions.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

/** Layout constants of the composite contact-sheet.mjs writes. Kept in one place deliberately. */
export const SHEET = { cellW: 360, gap: 6, label: 14, get cellH() { return Math.round(this.cellW * 0.625); } };

export const BRIEF = `You are a design judge. You have no stake in the work you are judging and you
have not seen how it was built. Do not go looking for the source code, the git history, or any
project notes — your verdict must come from the images alone, and reading the builder's own account
of its work would only import its blind spots.

Read these two image files with the Read tool (they render as images):

SET A — the reference design:
  {A}

SET B — the build under review:
  {B}

Each file is {N} frames sampled at matching positions down two long scrolling pages, in reading
order (top-left, top-right, then down). Frame 1 is the top of the page, the last frame the bottom.

SET A is the reference design. SET B is an attempt to build a site in the same visual language. The
CONTENT is deliberately different — different company, different words, different subject matter.
You are not judging whether they show the same thing.

Judge ONLY whether B belongs to the same visual world as A. Consider:
  - pacing: how much room each section gets, how empty or full the screens are
  - tonal structure: how often and how dramatically the ground changes
  - typographic voice: weight, width, case, scale relative to the viewport
  - imagery treatment: photographic vs drawn, cut-out vs framed, how the subject sits on the ground
  - overall level of finish

Answer in strict JSON, no prose outside it:
{
  "same": true | false,
  "confidence": 0.0-1.0,
  "differences": ["specific, actionable difference", "..."],
  "worst": "the single most damaging difference, in one sentence"
}

Be harsh. If a designer would not accept B as being in A's family, "same" is false. Make every entry
in "differences" specific enough to act on — name the frame number and what is wrong with it, not a
general impression.`;

/** Pick `n` indices spread evenly across `total`, always including the first and last. */
export function sampleIndices(total, n) {
  if (total <= 0) return [];
  if (n >= total) return Array.from({ length: total }, (_, i) => i);
  if (n === 1) return [0];
  return Array.from({ length: n }, (_, k) => Math.round((k * (total - 1)) / (n - 1)));
}

/**
 * Sample so that no TONAL EVENT is stepped over.
 *
 * WHY. Even sampling of 8 frames from a 34-screen page lands every ~4.7 screens, so any section one
 * or two screens long can fall entirely between samples. That is not hypothetical: the judge scored
 * a build "no CTA moment at all… ends on continuous light grey" while the ground-sequence check
 * measured its crossings as matching the reference exactly. Both were right about what they saw —
 * the dark CTA sat at slice 32 and the dark insights band at slice 30, and the sample was
 * 0,5,9,14,19,24,28,33. It stepped over both. An iteration was then briefed to "restore the dark
 * closing CTA" that was already there and full-height.
 *
 * So: take every index where the ground CHANGES (and the screen after it, which is what the change
 * lands on), then fill the remaining budget evenly. A judge that never sees a section cannot report
 * on it, and its silence reads as absence.
 *
 * `classes` is a per-slice ground label; any labels work, only equality matters.
 */
export function sampleWithTransitions(classes, n) {
  const total = classes.length;
  if (total <= 0) return [];
  if (n >= total) return Array.from({ length: total }, (_, i) => i);

  const edges = [];
  for (let i = 1; i < total; i++) {
    if (classes[i] !== classes[i - 1]) { edges.push(i - 1, i); }
  }
  const transitions = [...new Set(edges)].filter((i) => i !== 0 && i !== total - 1).sort((a, b) => a - b);

  // More tonal events than frames. Taking the FIRST n of them biases the whole sample to the top of
  // the page — the same "never sees the end" failure this function exists to fix — so spread the
  // chosen transitions evenly across the list instead, and always keep the first and last screen.
  if (transitions.length + 2 > n) {
    const budget = Math.max(0, n - 2);
    const picked = budget === 0 ? [] : budget === 1 ? [transitions[Math.floor(transitions.length / 2)]]
      : Array.from({ length: budget }, (_, k) => transitions[Math.round((k * (transitions.length - 1)) / (budget - 1))]);
    return [...new Set([0, total - 1, ...picked])].sort((a, b) => a - b);
  }

  const out = new Set([0, total - 1, ...transitions]);
  for (const i of sampleIndices(total, n)) {
    if (out.size >= n) break;
    out.add(i);
  }
  // Still short (transitions clustered): top up with whatever is missing, evenly.
  for (let i = 0; out.size < n && i < total; i++) out.add(i);
  return [...out].sort((a, b) => a - b).slice(0, n);
}

/** Ground label for a mean luminance, matching contact-sheet.mjs's thresholds. */
export const groundOf = (l) => (l < 0.28 ? "dark" : l > 0.62 ? "light" : "mid");

/** Where row `i`'s build cell sits in the composite. */
export function buildCellBox(i, s = SHEET) {
  const row = s.cellH + s.gap + s.label;
  const y = s.gap + i * row + s.label;
  const x = s.gap * 2 + s.cellW;
  return [x, y, x + s.cellW, y + s.cellH];
}

function selftest() {
  const checks = [];
  const t = (n, c) => checks.push({ n, ok: !!c });

  t("samples include first and last", (() => { const s = sampleIndices(34, 8); return s[0] === 0 && s[7] === 33; })());

  // The real page that exposed the bug: dark hero, a dark run at 19-23, a dark band at 30, a dark
  // CTA at 32. Even sampling steps over 30 and 32; transition-aware sampling must not.
  const real = Array(34).fill("light");
  for (const i of [0, 1]) real[i] = "dark";
  for (const i of [10, 11, 12, 13, 14, 15]) real[i] = "mid";
  for (const i of [19, 20, 21, 22, 23]) real[i] = "dark";
  real[24] = "mid"; real[30] = "dark"; real[31] = "mid"; real[32] = "mid";
  const evenS = sampleIndices(34, 12);
  const transS = sampleWithTransitions(real, 12);
  t("even sampling MISSES the late dark band that caused this", !sampleIndices(34, 8).includes(30));
  t("transition sampling catches the late dark band", transS.includes(30) || transS.includes(29));
  t("transition sampling is still sorted and unique", transS.every((v, i) => i === 0 || v > transS[i - 1]));
  t("transition sampling respects the frame budget", transS.length <= 12);
  t("transition sampling keeps the first and last frame", transS[0] === 0 && transS[transS.length - 1] === 33);
  t("more events than frames still yields a sorted subsequence", (() => {
    const alt = Array.from({ length: 20 }, (_, i) => (i % 2 ? "dark" : "light"));
    const r = sampleWithTransitions(alt, 6);
    return r.length === 6 && r.every((v, i) => i === 0 || v > r[i - 1]);
  })());
  t("a flat page falls back to even spacing", (() => {
    const flat = Array(10).fill("light");
    return JSON.stringify(sampleWithTransitions(flat, 4)) === JSON.stringify([...new Set([0, 9, ...sampleIndices(10, 4)])].sort((a, b) => a - b).slice(0, 4));
  })());
  t("groundOf matches the contact-sheet thresholds", groundOf(0.09) === "dark" && groundOf(0.42) === "mid" && groundOf(0.92) === "light");
  t("even and transition sampling differ on this page", JSON.stringify(evenS) !== JSON.stringify(transS));
  t("samples are strictly increasing", (() => { const s = sampleIndices(34, 8); return s.every((v, i) => i === 0 || v > s[i - 1]); })());
  t("asking for more frames than exist returns all", sampleIndices(3, 8).length === 3);
  t("a single frame is the first", JSON.stringify(sampleIndices(34, 1)) === "[0]");
  t("no frames from an empty set", sampleIndices(0, 8).length === 0);

  // Cell geometry must match contact-sheet.mjs, or the build frames come out sliced across rows.
  t("cellH follows the 0.625 aspect", SHEET.cellH === 225);
  t("row 0 build cell starts below its label", buildCellBox(0)[1] === 20);
  t("build cell is the right-hand column", buildCellBox(0)[0] === 372);
  t("cells do not overlap between rows", buildCellBox(1)[1] >= buildCellBox(0)[3]);
  t("cell is exactly cellW wide", buildCellBox(2)[2] - buildCellBox(2)[0] === SHEET.cellW);

  t("brief demands strict JSON", /strict JSON/.test(BRIEF));
  t("brief forbids reading the source", /Do not go looking for the source code/.test(BRIEF));
  t("brief carries both placeholders", BRIEF.includes("{A}") && BRIEF.includes("{B}"));

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) console.log(`${c.ok ? "ok  " : "FAIL"} ${c.n}`);
  console.log(`\n${checks.length - failed.length}/${checks.length} assertions passed`);
  return failed.length ? 1 : 0;
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  if (argv.includes("--selftest")) process.exit(selftest());

  const refDir = arg("--ref-dir");
  const sheet = arg("--sheet");
  const out = arg("--out");
  const n = Number(arg("--frames", "12"));
  if (!refDir || !sheet || !out) {
    console.error("usage: judge-frames.mjs --ref-dir <slices> --sheet <contact-sheet.jpg> --out <dir> [--frames 12]");
    process.exit(2);
  }
  for (const p of [refDir, sheet]) {
    if (!fs.existsSync(p)) { console.error(`NOT CHECKED — missing ${p}. Run contact-sheet.mjs first.`); process.exit(4); }
  }

  let sharp;
  try { sharp = createRequire(path.join(process.cwd(), "x.js"))("sharp"); } catch {}
  fs.mkdirSync(out, { recursive: true });

  // Composition is done with Python/Pillow when sharp is unavailable — Pillow ships in this image
  // and adding a node image dependency for a diagnostic tool is not worth the install.
  const refs = fs.readdirSync(refDir).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();

  // Choose frames so no tonal event is stepped over. Reference ground per slice is measured here
  // rather than assumed; see sampleWithTransitions for the run that made this necessary.
  const { execFileSync } = await import("node:child_process");
  let idx;
  try {
    const lums = JSON.parse(execFileSync("python3", ["-c", `
from PIL import Image
import json, os
d = ${JSON.stringify(refDir)}
fs = sorted(f for f in os.listdir(d) if f.lower().endswith(('.jpg','.jpeg','.png')))
out = []
for f in fs:
    im = Image.open(os.path.join(d, f)).convert('L').resize((64, 40))
    px = list(im.getdata())
    out.append(sum(px) / len(px) / 255.0)
print(json.dumps(out))
`], { encoding: "utf8" }));
    idx = sampleWithTransitions(lums.map(groundOf), n);
    console.log(`frame choice: transition-aware, ${idx.length} of ${refs.length} slices — ${idx.join(", ")}`);
  } catch (e) {
    idx = sampleIndices(refs.length, n);
    console.log(`frame choice: EVEN fallback (${e.message.slice(0, 60)}) — a tonal event may be stepped over`);
  }
  const script = `
from PIL import Image
import os
refs = ${JSON.stringify(idx.map((i) => path.join(refDir, refs[i])))}
boxes = ${JSON.stringify(idx.map((i) => buildCellBox(i)))}
cs = Image.open(${JSON.stringify(sheet)})
W, H, GAP = 640, 400, 24
cols = 2
rows = (len(refs) + cols - 1) // cols
def sheet_of(images):
    s = Image.new("RGB", (W*cols + GAP*(cols-1), (H+10)*rows), (240, 240, 240))
    for k, im in enumerate(images):
        s.paste(im.resize((W, H)), ((k % cols)*(W+GAP), (k//cols)*(H+10)))
    return s
sheet_of([Image.open(f).convert("RGB") for f in refs]).save(os.path.join(${JSON.stringify(out)}, "setA-reference.jpg"), quality=86)
sheet_of([cs.crop(tuple(b)).convert("RGB") for b in boxes]).save(os.path.join(${JSON.stringify(out)}, "setB-build.jpg"), quality=86)
print("frames written")
`;
  execFileSync("python3", ["-c", script], { stdio: "inherit" });

  const A = path.resolve(out, "setA-reference.jpg");
  const B = path.resolve(out, "setB-build.jpg");
  const brief = BRIEF.replace("{A}", A).replace("{B}", B).replace("{N}", String(idx.length));
  fs.writeFileSync(path.join(out, "BRIEF.txt"), brief);

  console.log(`\nSET A: ${A}\nSET B: ${B}\nbrief: ${path.join(out, "BRIEF.txt")}\n`);
  console.log("Now spawn a FRESH sub-agent with the contents of BRIEF.txt as its entire prompt.");
  console.log("It must not be given the build's context, transcript, or repo notes — that is the point.");
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(3); });
