#!/usr/bin/env node
/**
 * axis-motion — find the parts of a page that move SIDEWAYS as you scroll DOWN, and check the clone
 * moves there too.
 *
 * WHY. A still photograph of a horizontally-travelling element is indistinguishable from a still of a
 * static one. So every check in this skill was blind to a whole class of design: ink, edge, chroma
 * and rhythm all read one frame at a time, and the design judge reads one frame per position. Eleven
 * iterations of a clone shipped with a STATIC ghost word and a STATIC grid where the reference has a
 * giant word crossing the frame right-to-left and a rail of cards sliding in and out — three lateral
 * tracks running at once off vertical scroll, in one section.
 *
 * The owner's words: *"if a site i tell u to copy has a scrolling component that scrolls not up or
 * down u dont implement… those sort of abstractions is what makes the site feel more custom."*
 *
 * HOW. Motion is only visible in the DIFFERENCE between two frames, so this compares consecutive
 * slices rather than judging them singly. For each adjacent pair it finds the horizontal shift that
 * best aligns them: a band of the image is projected to a 1-D column-intensity signal, and the shift
 * maximising correlation between the two signals is the distance that content travelled sideways.
 * Vertical scrolling alone yields a peak at zero; a lateral track yields a non-zero peak.
 *
 * INDEXED BY DEPTH, NOT BY ORDINAL. Slice filenames carry the scroll position they were taken at
 * (`s19-15580.jpg`), so each capture is put on a 0..1 axis of its OWN page and both are resampled
 * onto the same equal fractions before anything is compared. Comparing the i-th file of one page
 * with the i-th file of another only works while the two pages are the same height — this one's
 * reference is 28,153px and the clone was 34,679, so 34 equal fractions of each landed on different
 * content and the findings had silently re-phased.
 *
 *   node axis-motion.mjs --ref-dir <slices> [--built-dir <slices>] [--grid N] [--json out.json] [--fail]
 *   node axis-motion.mjs --selftest
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/** A shift smaller than this is noise — JPEG grain and antialiasing, not travel. */
export const MIN_SHIFT_PX = 6;
/**
 * And a shift is only believable if the two signals actually ALIGN at it.
 *
 * The first run of this reported lateral travel on 23 of 34 screens, including pairs whose best
 * correlation was 0.14 or NEGATIVE — which means no alignment was found at all and the "shift" is
 * wherever the noise happened to peak. Consecutive screens of a scrolling page mostly show different
 * content, so a weak peak is the normal case, not evidence of motion. Without this floor the check
 * would have cried wolf on two thirds of the page, which is how a checker stops being read.
 */
export const MIN_SCORE = 0.62;
/**
 * Search this far either way.
 *
 * **160 was the original value and it made this checker blind to the exact thing it exists to
 * find.** Once the clone actually implemented its horizontal service track, the strip travelled
 * about 1,024px between adjacent slices — six times the search bound — so no alignment existed
 * anywhere inside the window and the best score the search could return was whatever the noise
 * peaked at. It scored **-0.310 at 8->9 and -0.128 at 11->12**: negative correlations, i.e. "these
 * two frames are anti-aligned", reported about a track that was demonstrably moving (the project's
 * own `scripts/prove-horizontal.mjs` measures the same strip travelling -3,828px across five
 * depths). A bound narrower than the motion being measured does not report "too far to tell", it
 * reports a confident wrong answer.
 *
 * 1,200px is past the widest real travel observed (~1,024) with room to spare, and it is bounded by
 * something real rather than chosen: a shift of 1,200px on a 1,440px frame leaves 240px — 17% — of
 * overlap, which is under `MIN_OVERLAP_FRAC` and therefore rejected before it is ever scored. So
 * the effective ceiling is the overlap rule, and this constant only has to be large enough not to
 * cut the search off before that rule bites.
 */
export const MAX_SHIFT_PX = 1200;
/**
 * How much of the two signals has to still overlap at a candidate shift for its score to count.
 *
 * This was hard-coded at 0.5, which caps the findable shift at half a frame (720px) no matter how
 * wide `MAX_SHIFT_PX` is — so widening the bound alone would have changed nothing. 0.28 admits the
 * ~1,024px travel the service track actually has (416px of a 1,440px frame still in common) and
 * stops well short of the degenerate end, where a handful of samples correlate perfectly with
 * anything. `MIN_OVERLAP_SAMPLES` is the second half of that guard: a fraction is not enough on its
 * own, because a small enough absolute sample count will always find a spurious match.
 */
export const MIN_OVERLAP_FRAC = 0.28;
/** Never score an alignment on fewer samples than this, whatever the fraction says. */
export const MIN_OVERLAP_SAMPLES = 120;
/**
 * How much better than STANDING STILL an alignment has to be before it counts as travel.
 *
 * This is the guard the widening made necessary, and it was written because the first widened run
 * produced exactly the failure mode it prevents: it reported the space hero as travelling +1,036px
 * sideways at correlation 0.985 (`reference/slices/s00-0.jpg` -> `s01-820.jpg`), and the aerial
 * ocean as travelling -1,036px, on two of the flattest frames on the page. A near-uniform field —
 * a starfield, an expanse of navy water — has almost no horizontal structure, so after Pearson's
 * normalisation it correlates about equally well with itself at EVERY offset, and a +/-1200px
 * search simply hands back whichever offset won by a hair. A +/-160px search hid that because it
 * never got far enough out for the number to look dramatic; widening the window exposed it.
 *
 * A real lateral track aligns dramatically better at its true shift than at zero — that is what
 * "the content moved" means. A flat field does not. So the score at the best shift has to beat the
 * score at zero by this margin, and otherwise the pair is reported as not travelling. It can only
 * ever make this checker quieter, never louder.
 */
export const MIN_MARGIN = 0.08;
/**
 * Column samples per captured frame. 320 (4.5px per sample) was fine for a +/-160px search; a
 * 1,024px shift is 227 of those samples out of 320, which leaves the correlation almost nothing to
 * chew on. At 720 samples (2px each) the same shift is 512 of 720 and 208 samples still overlap.
 */
export const SIGNAL_W = 720;

/**
 * Best horizontal alignment between two 1-D column signals.
 * Returns { shift, score } where shift is in signal samples, positive meaning `b` sits to the RIGHT.
 */
export function bestShift(a, b, maxShift = 40, minOverlapFrac = MIN_OVERLAP_FRAC, minOverlapSamples = MIN_OVERLAP_SAMPLES) {
  const n = Math.min(a.length, b.length);
  if (!n) return { shift: 0, score: 0 };
  const mean = (v, s, e) => { let t = 0; for (let i = s; i < e; i++) t += v[i]; return t / Math.max(1, e - s); };
  const floor = Math.max(n * minOverlapFrac, Math.min(minOverlapSamples, n));
  let best = { shift: 0, score: -Infinity };
  let zero = -Infinity;
  for (let s = -maxShift; s <= maxShift; s++) {
    const lo = Math.max(0, -s), hi = Math.min(n, n - s);
    if (hi - lo < floor) continue;            // too little overlap to trust
    const ma = mean(a, lo, hi), mb = mean(b, lo + s, hi + s);
    let num = 0, da = 0, db = 0;
    for (let i = lo; i < hi; i++) {
      const x = a[i] - ma, y = b[i + s] - mb;
      num += x * y; da += x * x; db += y * y;
    }
    const score = da && db ? num / Math.sqrt(da * db) : 0;
    /* Strictly better wins; a TIE goes to the smaller shift. Widening the window from +/-160 to
       +/-1200 multiplies the number of candidate alignments by seven, and a periodic frame (a grid,
       a card rail, a dashed line) correlates with itself at several of them equally well. Without
       this the search would drift to whichever repeat happened to score a hair higher, and report a
       page as travelling a screen sideways because its column grid repeats. Preferring the nearest
       alignment is the conservative reading and it can only ever make this checker quieter. */
    if (s === 0) zero = score;
    if (score > best.score + 1e-9 || (Math.abs(score - best.score) <= 1e-9 && Math.abs(s) < Math.abs(best.shift)))
      best = { shift: s, score };
  }
  if (best.score === -Infinity) return { shift: 0, score: 0 };
  /* A peak sitting ON the edge of the searchable range is not an alignment, it is the best of the
     offsets we were allowed to try — the correlation was still climbing when the overlap rule cut
     the search off. The first widened run reported the space hero travelling +1,036px at
     correlation 0.985 and the aerial ocean -1,036px, and 1,036px is exactly the boundary: 720
     samples with a 28% overlap floor admits |s| <= 518, and 518 * 2px = 1,036. Every one of those
     "findings" was the search hitting its own wall. This is reported as OUT OF RANGE — neither
     travel nor stillness — because "we could not tell" is the true answer and a checker that dresses
     it up as either is the failure this whole ticket is about. */
  const sMax = Math.floor(n - floor);
  if (best.shift !== 0 && Math.abs(best.shift) >= sMax - 1) return { shift: best.shift, score: best.score, outOfRange: true };
  // Not distinctly better than standing still => the frame has no horizontal structure to align.
  if (best.shift !== 0 && best.score - zero < MIN_MARGIN) return { shift: 0, score: zero, flat: true };
  return best;
}

/** Classify a run of pairwise shifts into the sections that actually travel. */
export function lateralSections(shifts, minPx = MIN_SHIFT_PX, minScore = MIN_SCORE) {
  const out = [];
  for (let i = 0; i < shifts.length; i++) {
    if (shifts[i].outOfRange || shifts[i].degenerate) continue;   // not measured is not measured
    const px = Math.abs(shifts[i].shift);
    if (px >= minPx && shifts[i].score >= minScore) out.push({ from: i, to: i + 1, shift: shifts[i].shift, score: +shifts[i].score.toFixed(3) });
  }
  return out;
}

/** The pairs this run could not adjudicate on either page, so a caller reports them as NOT CHECKED. */
export function unadjudicated(refShifts, builtShifts = []) {
  const out = [];
  const n = Math.max(refShifts.length, builtShifts.length);
  for (let i = 0; i < n; i++) {
    const r = refShifts[i], b = builtShifts[i];
    const why = [];
    if (r?.outOfRange) why.push(`reference peaked at the edge of the searchable range (${r.shift}px)`);
    if (b?.outOfRange) why.push(`build peaked at the edge of the searchable range (${b.shift}px)`);
    if (r?.degenerate || b?.degenerate) why.push("a capture had too few slices to give this fraction its own frame");
    if (why.length) out.push({ at: i, why: why.join("; ") });
  }
  return out;
}

/** Reference travels here and the build does not: the finding this file exists to produce. */
export function compare(refShifts, builtShifts, minPx = MIN_SHIFT_PX, minScore = MIN_SCORE) {
  const findings = [];
  const n = Math.min(refShifts.length, builtShifts.length);
  for (let i = 0; i < n; i++) {
    // Neither travel nor stillness was established here, so nothing can be concluded about it.
    if (refShifts[i].outOfRange || builtShifts[i].outOfRange || refShifts[i].degenerate || builtShifts[i].degenerate) continue;
    // A shift only counts on either side if its correlation says the frames really aligned there.
    const rOk = refShifts[i].score >= minScore, bOk = builtShifts[i].score >= minScore;
    const r = rOk ? Math.abs(refShifts[i].shift) : 0;
    const b = bOk ? Math.abs(builtShifts[i].shift) : 0;
    if (r >= minPx && b < minPx)
      findings.push({ id: "missing-lateral-track", at: i,
        detail: `between fractions ${i} and ${i + 1} of the page (equal depths on BOTH pages, not the i-th file of each) the reference travels ${r}px sideways and the build travels ${b}px. A horizontal track driven by vertical scroll has been flattened into a static element — the thing a single-frame check cannot see.` });
    if (b >= minPx && r < minPx)
      findings.push({ id: "invented-lateral-track", at: i,
        detail: `between fractions ${i} and ${i + 1} of the page (equal depths on BOTH pages) the build travels ${b}px sideways and the reference travels ${r}px. Motion that is not in the reference is not fidelity.` });
  }
  return findings;
}

function columnSignals(dir, files) {
  const script = `
from PIL import Image
import json, os
W = ${SIGNAL_W}
out = []
for f in ${JSON.stringify(files)}:
    im = Image.open(os.path.join(${JSON.stringify(dir)}, f)).convert('L').resize((W, 200))
    px = im.load()
    # Mid-band only: the top and bottom of a viewport are usually chrome or the next section.
    cols = []
    for x in range(W):
        s = 0
        for y in range(60, 150):
            s += px[x, y]
        cols.append(s / 90.0)
    out.append(cols)
print(json.dumps(out))
`;
  return JSON.parse(execFileSync("python3", ["-c", script], { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 }));
}

/**
 * Scroll position encoded in a slice's filename, or null.
 *
 * Both capture paths in this project name slices `<prefix><ordinal>-<scrollY>.<ext>` —
 * `reference/slices/s19-15580.jpg`, `b19-15580.jpg`. That number is the only thing that says WHERE
 * on its own page a slice was taken, and it is the whole basis of fraction indexing below.
 */
export function scrollOf(file) {
  const m = /-(\d+)\.(?:jpe?g|png)$/i.exec(file);
  return m ? Number(m[1]) : null;
}

/**
 * Put a directory of slices on a 0..1 depth axis of its OWN page.
 *
 * Falls back to ordinal position when the filenames carry no scroll value, so an old capture still
 * analyses — but then `byFraction` between two differently-sized pages is back to comparing
 * ordinals, and the caller is told (`derived: "ordinal"`).
 */
export function fractionIndex(files) {
  const scrolls = files.map(scrollOf);
  if (scrolls.some((v) => v === null) || files.length < 2) {
    return { derived: "ordinal", entries: files.map((file, i) => ({ file, f: i / Math.max(1, files.length - 1) })) };
  }
  const max = Math.max(...scrolls);
  return { derived: "scroll", entries: files.map((file, i) => ({ file, f: max ? scrolls[i] / max : 0 })) };
}

/**
 * Resample a slice run onto `n` equal fractions of its own page, nearest-neighbour.
 *
 * **This is the second half of the fix, and without it the widened search is still adjudicating the
 * wrong pairs.** The reference is 28,153px tall and this build was 34,679; 34 equal fractions of one
 * do not land on the same content as 34 equal fractions of the other, so the recorded findings
 * (12->13, 28->29) had quietly re-phased and were comparing a page's road passage against another
 * page's testimonials. Ordinal index i means "the i-th file"; fraction index i means "the same
 * relative depth on both pages", which is the only comparison that means anything when the two
 * pages are different lengths — and they always are.
 */
export function byFraction(entries, n) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const target = n === 1 ? 0 : k / (n - 1);
    let best = entries[0];
    for (const e of entries) if (Math.abs(e.f - target) < Math.abs(best.f - target)) best = e;
    out.push({ ...best, target });
  }
  return out;
}

function analyse(dir, n) {
  const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
  if (files.length < 2) return { files, frames: [], shifts: [], derived: "none" };
  const { derived, entries } = fractionIndex(files);
  const frames = byFraction(entries, n ?? files.length);
  const sig = columnSignals(dir, frames.map((e) => e.file));
  // one sample is 1440 / SIGNAL_W px of the captured frame
  const scale = 1440 / SIGNAL_W;
  const shifts = [];
  for (let i = 1; i < sig.length; i++) {
    // Two frames resampled to the SAME file carry no information; say so rather than scoring 1.0 at 0.
    if (frames[i].file === frames[i - 1].file) { shifts.push({ shift: 0, score: 0, degenerate: true }); continue; }
    const r = bestShift(sig[i - 1], sig[i], Math.round(MAX_SHIFT_PX / scale));
    // Carry the flags through. Dropping them here is how an "out of range" silently became a finding.
    shifts.push({ ...r, shift: Math.round(r.shift * scale) });
  }
  return { files, frames, shifts, derived };
}

function selftest() {
  const checks = [];
  const t = (n, c) => checks.push({ n, ok: !!c });
  const ramp = (n, off) => Array.from({ length: n }, (_, i) => Math.sin((i + off) / 7) * 50 + 128);

  t("identical signals align at zero", bestShift(ramp(200, 0), ramp(200, 0), 30).shift === 0);
  const right = bestShift(ramp(200, 0), ramp(200, -12), 30);
  t("a signal shifted right is detected", Math.abs(right.shift - 12) <= 1);
  const left = bestShift(ramp(200, 0), ramp(200, 12), 30);
  t("a signal shifted left is detected with the opposite sign", Math.abs(left.shift + 12) <= 1);
  t("correlation of an exact match is ~1", bestShift(ramp(200, 0), ramp(200, 0), 30).score > 0.99);
  t("empty input does not throw", bestShift([], [], 10).shift === 0);

  t("a still page reports no lateral sections", lateralSections([{ shift: 0, score: 1 }, { shift: 2, score: 1 }]).length === 0);
  t("a travelling section is reported", lateralSections([{ shift: 40, score: 0.9 }]).length === 1);
  t("noise below the floor is ignored", lateralSections([{ shift: 5, score: 0.9 }]).length === 0);
  // Added after the first real run flagged 23 of 34 screens, including negatively-correlated pairs.
  t("a large shift with weak correlation is NOT travel", lateralSections([{ shift: 140, score: 0.14 }]).length === 0);
  t("a negative correlation is never travel", lateralSections([{ shift: 160, score: -0.4 }]).length === 0);
  t("a large shift with strong correlation IS travel", lateralSections([{ shift: 140, score: 0.91 }]).length === 1);
  t("a weakly-correlated reference shift raises no missing-track finding",
    compare([{ shift: 150, score: 0.2 }], [{ shift: 0, score: 1 }]).length === 0);

  const ref = [{ shift: 0, score: 1 }, { shift: 48, score: .9 }, { shift: 52, score: .9 }, { shift: 0, score: 1 }];
  const flat = [{ shift: 0, score: 1 }, { shift: 0, score: 1 }, { shift: 1, score: 1 }, { shift: 0, score: 1 }];
  const f = compare(ref, flat);
  t("FLAGS a reference track the build flattened", f.filter((x) => x.id === "missing-lateral-track").length === 2);
  t("names where it happens", f[0].detail.includes("fractions 1 and 2"));

  /* ---- the widened search bound, and the proof it did not become a rubber stamp ---------------
     Signals are SIGNAL_W samples wide for a 1440px frame, so one sample is 1440/SIGNAL_W px.
     A 1,024px travel — what this build's service strip actually does between adjacent slices — is
     512 samples at SIGNAL_W = 720. The old +/-160px bound could not even express it. */
  const px2s = (px) => Math.round(px / (1440 / SIGNAL_W));
  const wide = Math.round(MAX_SHIFT_PX / (1440 / SIGNAL_W));
  const big = px2s(1024);
  t("the search window can express the ~1024px travel the service track really has", wide >= big);
  const far = bestShift(ramp(SIGNAL_W, 0), ramp(SIGNAL_W, -big), wide);
  t("a 1024px-equivalent shift is FOUND by the widened search", Math.abs(far.shift - big) <= 2 && far.score > 0.9);
  const oldBound = Math.round(160 / (1440 / SIGNAL_W));
  const blind = bestShift(ramp(SIGNAL_W, 0), ramp(SIGNAL_W, -big), oldBound);
  t("...and was NOT findable at the old +/-160px bound", Math.abs(blind.shift - big) > 2);

  /* The widening must not turn into "anything correlates with anything". Two independent random
     signals must still produce a score under the MIN_SCORE floor, so `lateralSections` rejects
     them — this is the bad input the widened checker has to keep failing on. */
  let seed = 7;
  const rnd = (n) => Array.from({ length: n }, () => { seed = (seed * 1103515245 + 12345) % 2147483648; return (seed / 2147483648) * 255; });
  const noise = bestShift(rnd(SIGNAL_W), rnd(SIGNAL_W), wide);
  t("two unrelated frames still score below the floor at the wide bound", noise.score < MIN_SCORE);
  t("...so they raise no lateral section", lateralSections([noise]).length === 0);

  // A shift so far out that almost nothing overlaps must be refused, not scored.
  const tiny = bestShift(ramp(SIGNAL_W, 0), ramp(SIGNAL_W, 0), SIGNAL_W - 10, 0.28, 120);
  t("a near-total shift is refused by the overlap guard", Math.abs(tiny.shift) < SIGNAL_W * 0.72);
  // A periodic signal aligns at every period; the nearest alignment is the one reported.
  const per = Array.from({ length: SIGNAL_W }, (_, i) => Math.sin(i / 10) * 40 + 128);
  t("a periodic frame reports its NEAREST alignment, not a distant repeat", Math.abs(bestShift(per, per, wide).shift) === 0);

  /* The margin guard, and the two shapes it has to tell apart. A flat field with a little noise
     aligns about as well everywhere; a real track aligns far better at its own shift. */
  const flatField = Array.from({ length: SIGNAL_W }, (_, i) => 128 + Math.sin(i / 300) * 1.2 + ((i * 37) % 5) * 0.2);
  const flatField2 = Array.from({ length: SIGNAL_W }, (_, i) => 128 + Math.sin((i + 40) / 300) * 1.2 + ((i * 41) % 5) * 0.2);
  const flatRes = bestShift(flatField, flatField2, wide);
  t("a near-uniform field is NOT reported as a lateral track", flatRes.shift === 0 && flatRes.flat === true);
  t("...and the real 1024px track still survives the same guard", Math.abs(bestShift(ramp(SIGNAL_W, 0), ramp(SIGNAL_W, -big), wide).shift - big) <= 2);

  // An edge peak is "we could not tell", not travel, and it must not reach a finding either way.
  const edge = { shift: 1036, score: 0.98, outOfRange: true };
  t("an edge-of-range peak raises no lateral section", lateralSections([edge]).length === 0);
  t("...and no finding against a still build", compare([edge], [{ shift: 0, score: 1 }]).length === 0);
  t("...but IS reported as not adjudicated", unadjudicated([edge], [{ shift: 0, score: 1 }]).length === 1);
  t("an adjudicable pair is not in the not-checked list", unadjudicated([{ shift: 40, score: .9 }], [{ shift: 0, score: 1 }]).length === 0);

  /* ---- fraction indexing ---------------------------------------------------------------------- */
  t("scroll position is read out of a slice filename", scrollOf("s19-15580.jpg") === 15580);
  t("a filename without one reports null", scrollOf("b19.jpg") === null);
  const refIdx = fractionIndex(["s00-0.jpg", "s01-820.jpg", "s02-1640.jpg"]);
  t("filenames with scroll give a scroll-derived index", refIdx.derived === "scroll");
  t("...normalised to 0..1 of that page", refIdx.entries[2].f === 1 && refIdx.entries[0].f === 0);
  t("filenames without one fall back to ordinal, and SAY so", fractionIndex(["a.jpg", "b.jpg"]).derived === "ordinal");
  /* The re-phasing this fixes, in miniature: a short page and a long page, sampled to 3 fractions.
     By ordinal, index 1 of the short page is 50% down it and index 1 of the long page is 25% down —
     different content. By fraction both are the middle of their own page. */
  const shortPage = fractionIndex(["s0-0.jpg", "s1-100.jpg", "s2-200.jpg"]).entries;
  const longPage = fractionIndex(["b0-0.jpg", "b1-100.jpg", "b2-200.jpg", "b3-300.jpg", "b4-400.jpg"]).entries;
  const sg = byFraction(shortPage, 3), lg = byFraction(longPage, 3);
  t("two pages of different length land on the same relative depths", sg.map((e) => e.target).join() === lg.map((e) => e.target).join());
  t("the long page's middle fraction takes its OWN middle slice, not its second file", lg[1].file === "b2-200.jpg");
  t("resampling never runs past the end", byFraction(shortPage, 3)[2].file === "s2-200.jpg");
  t("PASSES a build that travels where the reference travels", compare(ref, ref).length === 0);
  const invented = compare(flat, ref);
  t("FLAGS motion the build invented", invented.some((x) => x.id === "invented-lateral-track"));
  t("a build that is merely close is not flagged", compare(ref, [{ shift: 0, score: 1 }, { shift: 44, score: .9 }, { shift: 55, score: .9 }, { shift: 2, score: 1 }]).length === 0);

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) console.log(`${c.ok ? "ok  " : "FAIL"} ${c.n}`);
  console.log(`\n${checks.length - failed.length}/${checks.length} assertions passed`);
  return failed.length ? 1 : 0;
}

const argv = process.argv.slice(2);
if (argv.includes("--selftest")) process.exit(selftest());
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const refDir = arg("--ref-dir"), builtDir = arg("--built-dir");
if (!refDir) { console.error("usage: axis-motion.mjs --ref-dir <slices> [--built-dir <slices>] [--json out]"); process.exit(2); }

/* Both pages are put on the SAME fraction grid before anything is compared. The grid is as fine as
   the coarser of the two captures allows — resampling past that would pair a frame with itself. */
const refFiles = fs.readdirSync(refDir).filter((f) => /\.(jpe?g|png)$/i.test(f));
const grid = Number(arg("--grid", 0)) ||
  (builtDir ? Math.min(refFiles.length, fs.readdirSync(builtDir).filter((f) => /\.(jpe?g|png)$/i.test(f)).length) : refFiles.length);

const ref = analyse(refDir, grid);
const lat = lateralSections(ref.shifts);
const at = (i) => `${(ref.frames[i]?.target ?? 0).toFixed(3)} of the page (${ref.frames[i]?.file})`;
console.log(`reference: ${ref.files.length} slices, indexed by ${ref.derived}, resampled to ${grid} equal fractions; ${lat.length} with lateral travel`);
for (const s of lat) console.log(`  fraction ${s.from}->${s.to}  ${s.shift > 0 ? "+" : ""}${s.shift}px sideways  (correlation ${s.score})  ${at(s.from)} -> ${at(s.to)}`);

if (builtDir) {
  const built = analyse(builtDir, grid);
  const findings = compare(ref.shifts, built.shifts);
  console.log(`\nbuild: ${built.files.length} slices, indexed by ${built.derived}, resampled to the same ${grid} fractions`);
  if (ref.derived === "ordinal" || built.derived === "ordinal")
    console.log(`  PAIRED BY ORDINAL (${ref.derived === "ordinal" ? "reference" : ""}${ref.derived === "ordinal" && built.derived === "ordinal" ? " and " : ""}${built.derived === "ordinal" ? "build" : ""}): those filenames carry no scroll position, so slice i is ASSUMED to be fraction i/(n-1) of its own page. That is exact for a capture taken at equal fractions (contact-sheet.mjs is one) and wrong for a fixed-pixel cadence like this reference's 820px steps, whose last slice is 0.961 of its page and not 1.0. Name slices \`<n>-<scrollY>\` to remove the assumption.`);
  const skipped = unadjudicated(ref.shifts, built.shifts);
  if (skipped.length) {
    console.log(`\nNOT ADJUDICATED (${skipped.length}) — reported as not-checked, never as a pass:`);
    for (const u of skipped) console.log(`  fractions ${u.at}->${u.at + 1}: ${u.why}`);
  }
  if (!findings.length) console.log("RESULT: the build travels sideways where the reference does, at every fraction this run could adjudicate.");
  else {
    console.log(`\nFINDINGS (${findings.length}):`);
    for (const f of findings) console.log(`  ${f.id}  ${f.detail}`);
  }
  if (arg("--json")) fs.writeFileSync(arg("--json"), JSON.stringify({ ref: ref.shifts, built: built.shifts, findings }, null, 2));
  process.exit(findings.length && argv.includes("--fail") ? 1 : 0);
}
