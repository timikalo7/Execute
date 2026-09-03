#!/usr/bin/env node
/**
 * debt-ratchet — the warning ratchet, applied to every OTHER pile that is detected and never
 * prevented.
 *
 * `security-gate`'s warning budget fixed one pile: 71 findings printed on every push and blocking
 * nothing. Measuring the repo for the same shape found four more, all bigger:
 *
 *     TODO(keys)      59 occurrences in 37 files
 *     "unverified"   204 occurrences in 89 files
 *     "still open"    51 occurrences in 50 files
 *     "NOT CHECKED"   26 occurrences in 23 files
 *
 * Each is an honest marker doing real work — `TODO(keys)` is the credential-scaffolding convention,
 * "NOT CHECKED" is the rule that a skipped check is never reported as done. That honesty is exactly
 * why they grow: writing one is virtuous and nothing ever makes anybody close one. Marking debt is
 * not the same as carrying it deliberately.
 *
 * Same mechanism, same guarantee: a counted pile with a written reason, over budget FAILS, under
 * budget ratchets DOWN. The number can only go down.
 *
 *   node debt-ratchet.mjs              # count, compare, ratchet
 *   node debt-ratchet.mjs --baseline   # (re)write the budget from current counts
 *   node debt-ratchet.mjs --selftest
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/**
 * The scan root is the REPOSITORY, never the current directory.
 *
 * This read `process.cwd()`, and that made the ratchet corrupt its own baseline. Run it from
 * projects/example-an example component library and it walks only that subtree, counts 16 not-checked markers instead of
 * 57 — and then, because 16 is fewer than the budget, RATCHETS THE SHARED BUDGET DOWN TO 16 and
 * writes it. Every pile was rewritten to a partial count in one accidental invocation. The next
 * full run would then fail against a floor no full tree can meet, and the failure would look like
 * new debt rather than like a clobbered file.
 *
 * A ratchet is only meaningful if every run measures the same file set, so the root is now the git
 * top level regardless of where the command was typed. EXECUTE_ROOT still overrides, explicitly.
 */
const ROOT = process.env.EXECUTE_ROOT || (() => {
  try {
    const top = execSync("git rev-parse --show-toplevel", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (top && fs.existsSync(top)) return top;
  } catch { /* not a git checkout — fall back to cwd, which is all there is */ }
  return process.cwd();
})();
const BUDGET = path.join(HERE, "debt-budget.json");

/**
 * The markers. Each is a real convention in this repo, not a code smell — which is the point: these
 * are the notes we leave ourselves, and the question is only whether the pile grows.
 */
export const MARKERS = [
  { id: "todo-keys",   re: /TODO\(keys\)/g,        what: "a credential the build was scaffolded around" },
  { id: "todo-credits",re: /TODO\(credits\)/g,     what: "a step skipped because a credit balance would not cover it" },
  // `prose: true` marks the four whose text is ordinary English rather than a coined token. Those
  // are also the vocabulary the gates THEMSELVES speak — a gate branch that refuses to fake a pass
  // says "NOT CHECKED", a briefing rule is named "unverified" — so counting them inside a checker
  // measures the instrument. See PROSE_EXEMPT_PATHS.
  { id: "not-checked", re: /\bNOT[ -]CHECKED\b/gi, what: "a check that was skipped, reported honestly as skipped", prose: true },
  { id: "unverified",  re: /\bunverified\b/gi,     what: "a claim recorded without evidence behind it", prose: true },
  { id: "still-open",  re: /\bstill open\b/gi,     what: "a decision or thread left unresolved", prose: true },
  { id: "your-call",   re: /\byour call\b/gi,      what: "a decision handed to the owner and not yet made", prose: true },
];

/**
 * Where a PROSE marker is the checker's own vocabulary rather than repo debt.
 *
 * This generalises `SELF` by exactly one notch, and no further. `SELF` already exempts this file and
 * its budget because scanning them counts the measuring instrument as the thing measured. The same
 * is true of every other gate: `design-loop.sh` prints "NOT CHECKED" in the branch that refuses to
 * turn a missing vision key into a pass, and `lint-brief.mjs` has a rule literally named
 * "unverified". Each honest branch added to a gate inflated this pile, so it grew fastest exactly
 * when reporting was most careful — the opposite of its purpose, and it forced FIVE budget raises in
 * one session before anyone stopped to ask what it was measuring.
 *
 * Deliberately narrow: only the four PROSE markers, only under the skills and hooks directories.
 * `TODO(keys)` and `TODO(credits)` are coined tokens that no gate speaks by accident, so they are
 * still counted everywhere, including here — a skill that scaffolds around a credential is real debt
 * wherever it lives.
 */
export const PROSE_EXEMPT_PATHS = [
  /(^|\/)\.claude\/skills\//,
  /(^|\/)\.claude\/hooks\//,
];

/**
 * A file may DECLARE itself an instrument, instead of being recognised by its path.
 *
 * The path list above covers the shared checkers. A project's own measurement scripts are
 * instruments by exactly the same argument — they are gates, they speak the gates' vocabulary, and
 * counting that vocabulary measures the instrument rather than the repo — but they live wherever
 * the project puts them, under whatever name fits what they do.
 *
 * A filename pattern was tried first (`scripts/prove-*.mjs`) and it failed on the very next
 * instrument, `measure-depths.mjs`, which is a measurement tool rather than a pass/fail prover and
 * is correctly named for that. The available moves were then to widen the pattern until it stopped
 * meaning anything, or to rename a file so a regex would match it — renaming an artifact to satisfy
 * a checker being precisely the gaming this repo forbids.
 *
 * So the file says so itself. One line, greppable, and impossible to trip by accident: ordinary
 * source does not carry this string, and a real deferred-work marker in a file that is NOT declared
 * still counts, which is the property that makes the pile worth keeping.
 *
 * Three of the four markers that forced this were the tool's own RUNTIME OUTPUT — the line it
 * prints when it cannot run — so rewording them, the previous remedy, would have meant making a
 * checker report a skipped run less honestly to satisfy a debt counter.
 */
export const INSTRUMENT_DECLARATION = "@debt-ratchet instrument";
export const declaresInstrument = (text) =>
  typeof text === "string" && text.includes(INSTRUMENT_DECLARATION);

export const isCheckerFile = (f) => PROSE_EXEMPT_PATHS.some((re) => re.test(f.replace(/\\/g, "/")));

const SKIP_DIRS = new Set([
  ".git", "node_modules", ".next", "dist", "build", ".store", "coverage",
  ".claude/skill-library", "out", ".venv", "__pycache__",
  // A subagent running under worktree isolation checks this same repo out again beneath
  // .claude/worktrees/. Walking it counts every marker in the repository twice and doubles every
  // pile, which is a miscount rather than new debt. Matched on the relative path, as the walker
  // already tests `rel` against this set.
  ".claude/worktrees",
]);
const TEXT = /\.(md|mjs|js|ts|tsx|jsx|json|sh|py|yml|yaml|txt)$/i;

/**
 * The ratchet's own bookkeeping is not repo debt. This file defines the markers as literals and the
 * budget file quotes them in every reason string, so scanning them counts the measuring instrument
 * as the thing measured — the first baseline run inflated its own counts and then failed against
 * them on the very next run. Narrow and named: two specific files, not a pattern like "any json".
 */
export const SELF = new Set(["debt-ratchet.mjs", "debt-budget.json"]);

export function walk(dir, out = [], base = dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    const rel = path.relative(base, p);
    if (SKIP_DIRS.has(e.name) || SKIP_DIRS.has(rel)) continue;
    if (e.isDirectory()) walk(p, out, base);
    else if (TEXT.test(e.name) && !SELF.has(e.name)) out.push(p);
  }
  return out;
}

export function countMarkers(files, read = (f) => fs.readFileSync(f, "utf8")) {
  const counts = Object.fromEntries(MARKERS.map((m) => [m.id, 0]));
  const where = Object.fromEntries(MARKERS.map((m) => [m.id, []]));
  /**
   * Every file exempted by its own declaration rather than by its path, so the exemption is never
   * silent. A declaration is deliberate and greppable — nothing trips it by accident — but it is
   * still a file exempting itself, so the run says which ones did. An unexpected name in this list
   * is the signal that someone put the string somewhere it does not belong.
   */
  const declaredInstruments = [];
  for (const f of files) {
    let text; try { text = read(f); } catch { continue; }
    // A file is an instrument by its PATH (the shared checkers) or by its own declaration.
    const declared = declaresInstrument(text);
    const checker = isCheckerFile(f) || declared;
    if (declared && !isCheckerFile(f)) declaredInstruments.push(f);
    for (const m of MARKERS) {
      if (m.prose && checker) continue;
      const n = (text.match(m.re) || []).length;
      if (!n) continue;
      counts[m.id] += n;
      where[m.id].push(`${f}:${n}`);
    }
  }
  return { counts, where, declaredInstruments };
}

/**
 * The comparison. Deliberately identical in shape to the warning budget, including the two rules
 * that make it more than a counter: a pile with no budget entry FAILS rather than being adopted
 * silently, and an entry with no reason FAILS, so "accepted" always means somebody said why.
 */
export function compare(counts, budget) {
  const fails = [], downs = [];
  for (const [id, count] of Object.entries(counts)) {
    if (count === 0) continue;
    const entry = budget[id];
    if (!entry) { fails.push(`${id}: ${count} and NO budget entry — accept it explicitly with a reason, or close them`); continue; }
    if (!entry.reason || /^TODO/i.test(entry.reason)) { fails.push(`${id}: budgeted at ${entry.max} with no reason recorded`); continue; }
    if (count > entry.max) fails.push(`${id}: ${count}, budget ${entry.max} — ${count - entry.max} NEW. Close them, or raise the budget deliberately in its own commit with the reason.`);
    else if (count < entry.max) downs.push({ id, from: entry.max, to: count });
  }
  return { fails, downs };
}

/* --------------------------------------------------------------------------- selftest */

function selfTest() {
  let pass = 0, fail = 0;
  const check = (ok, what) => { ok ? pass++ : (fail++, console.log(`  FAIL  ${what}`)); };

  const fake = { "a.md": "TODO(keys) here and TODO(keys) again\nNOT CHECKED\n", "b.md": "totally unverified and Unverified\n" };
  const { counts } = countMarkers(Object.keys(fake), (f) => fake[f]);
  check(counts["todo-keys"] === 2, `counts every occurrence, not every file (got ${counts["todo-keys"]})`);
  check(counts["not-checked"] === 1, "NOT CHECKED is counted");
  check(counts["unverified"] === 2, "matching is case-insensitive where the marker is prose");
  check(counts["todo-credits"] === 0, "a marker that does not appear counts zero");

  // The prose exemption, asserted in both directions. Added after this pile forced five budget
  // raises in one session purely because the gates' own honest branches kept inflating it.
  const inChecker = {
    ".claude/skills/visual-qa/design-loop.sh": "echo 'leg 3 NOT CHECKED'\nunverified\nstill open\nyour call\n",
    ".claude/hooks/pre-push-gate.sh": "NOT CHECKED\n",
    "projects/p/PROJECT-LOG.md": "the vision leg is NOT CHECKED\n",
  };
  const c2 = countMarkers(Object.keys(inChecker), (f) => inChecker[f]).counts;
  check(c2["not-checked"] === 1, `prose markers inside a checker are not repo debt (got ${c2["not-checked"]}, want 1 from the project file)`);
  check(c2["unverified"] === 0, "a briefing rule NAMED unverified is not a claim without evidence");
  check(c2["still-open"] === 0 && c2["your-call"] === 0, "the other prose markers are exempt in checkers too");

  const keysInSkill = { ".claude/skills/x/SKILL.md": "TODO(keys) still needed\nTODO(credits) too\n" };
  const c3 = countMarkers(Object.keys(keysInSkill), (f) => keysInSkill[f]).counts;
  check(c3["todo-keys"] === 1 && c3["todo-credits"] === 1,
    "coined TODO tokens are STILL counted inside a skill — a scaffolded credential is debt wherever it lives");

  check(isCheckerFile(".claude/skills/a/b.mjs") && isCheckerFile("/repo/.claude/hooks/h.sh"), "checker paths are recognised");
  check(!isCheckerFile("projects/p/src/x.tsx") && !isCheckerFile("memory/principles.md"), "project and memory files are not checkers");
  check(declaresInstrument("// @debt-ratchet instrument\nNOT CHECKED"), "a file can declare itself an instrument");
  check(!declaresInstrument("// an ordinary source file\nNOT CHECKED"), "ordinary source does not declare itself one");
  check(!declaresInstrument(null) && !declaresInstrument(undefined), "a missing body declares nothing");

  const b = { "todo-keys": { max: 2, reason: "r" }, "not-checked": { max: 1, reason: "r" }, "unverified": { max: 2, reason: "r" } };
  check(compare(counts, b).fails.length === 0, "at budget, nothing fails");
  check(compare({ ...counts, "todo-keys": 3 }, b).fails.length === 1, "ONE over budget fails");
  check(compare({ ...counts, "todo-keys": 1 }, b).downs.length === 1, "under budget ratchets down");
  check(compare({ ...counts, "todo-credits": 1 }, b).fails.some((f) => f.includes("NO budget entry")),
    "a NEW pile with no entry fails instead of being adopted silently");
  check(compare(counts, { ...b, "todo-keys": { max: 2, reason: "" } }).fails.some((f) => f.includes("no reason")),
    "an entry with no reason fails — accepted must mean somebody said why");
  check(compare({ "todo-keys": 0 }, {}).fails.length === 0, "a pile at zero needs no budget entry");
  check(SELF.has("debt-budget.json") && SELF.has("debt-ratchet.mjs"),
    "the ratchet excludes its own bookkeeping — it defines these markers as literals, so counting itself would inflate every pile");
  // The scan root must not depend on where the command was typed. When it did, one accidental run
  // from a project subdirectory rewrote every pile's budget to a partial count.
  {
    const fromRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8", cwd: HERE }).trim();
    // ANY real subdirectory proves the point; this used to hardcode `projects/`, which made the
    // check depend on a directory that only exists once you have built something. On a fresh clone
    // it did not fail the assertion — it crashed with spawnSync ENOENT on the missing cwd, which is
    // a checker breaking rather than reporting. Pick a directory that is actually there.
    const subDir = ["projects", ".claude", "memory"]
      .map((d) => path.join(fromRoot, d))
      .find((d) => fs.existsSync(d)) ?? fromRoot;
    const fromSub = execSync("git rev-parse --show-toplevel", { encoding: "utf8", cwd: subDir }).trim();
    check(fromRoot === fromSub, "the git top level is the same from the repo root and from a subdirectory");
    check(ROOT === fromRoot || !!process.env.EXECUTE_ROOT, "ROOT is the git top level, not the current directory");
    check(!ROOT.includes(`${path.sep}projects${path.sep}`), "ROOT never points inside a single project");
  }
  check(!walk(HERE).some((f) => SELF.has(path.basename(f))),
    "walk() actually skips them, not just the set claiming it does");

  console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — debt-ratchet: ${pass} passed, ${fail} failed`);
  return fail;
}

/* --------------------------------------------------------------------------- cli */

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) process.exit(selfTest() ? 1 : 0);

  const files = walk(ROOT);
  const { counts, where, declaredInstruments } = countMarkers(files);

  // Never let a self-declared exemption be silent. A declaration is deliberate and greppable, but
  // it is still a file exempting itself, so every run names the ones that did. An unexpected entry
  // here is the signal that the string went somewhere it does not belong.
  if (declaredInstruments.length) {
    console.log(`\ninstruments (exempt from PROSE markers by their own declaration): ${declaredInstruments.length}`);
    for (const f of declaredInstruments) console.log(`  ${f}`);
  }

  if (process.argv.includes("--baseline") || !fs.existsSync(BUDGET)) {
    const doc = {
      _why: "THE DEBT RATCHET. These markers are honest conventions — TODO(keys) scaffolds around a missing credential, NOT CHECKED refuses to report a skipped check as done. That honesty is why they grow: writing one is virtuous and nothing ever closes one. Each pile now carries a counted budget and a reason. Over budget FAILS the push; under budget ratchets down. The number can only go down.",
      budget: Object.fromEntries(MARKERS.filter((m) => counts[m.id] > 0).map((m) => [m.id, {
        max: counts[m.id],
        reason: `Baselined 2026-08-28 — ${m.what}. Frozen: no NEW ones without closing an old one or raising this deliberately.`,
        reviewed: "2026-08-28",
      }])),
    };
    fs.writeFileSync(BUDGET, JSON.stringify(doc, null, 2) + "\n");
    console.log("debt-budget.json written from current counts:");
    for (const m of MARKERS) if (counts[m.id]) console.log(`  ${m.id.padEnd(14)} ${counts[m.id]}`);
    process.exit(0);
  }

  const doc = JSON.parse(fs.readFileSync(BUDGET, "utf8"));
  const { fails, downs } = compare(counts, doc.budget || {});

  console.log(`debt-ratchet — ${files.length} files scanned\n`);
  for (const m of MARKERS) {
    const b = doc.budget?.[m.id];
    console.log(`  ${m.id.padEnd(14)} ${String(counts[m.id]).padStart(4)}${b ? ` / ${b.max}` : ""}   ${m.what}`);
  }

  if (downs.length && !fails.length) {
    for (const d of downs) { doc.budget[d.id].max = d.to; doc.budget[d.id].reviewed = new Date().toISOString().slice(0, 10); }
    fs.writeFileSync(BUDGET, JSON.stringify(doc, null, 2) + "\n");
    console.log(`\nRATCHETED DOWN (locked in):`);
    for (const d of downs) console.log(`  ${d.id}: ${d.from} → ${d.to}`);
  }
  if (fails.length) {
    console.log(`\nDEBT BUDGET EXCEEDED (${fails.length}):`);
    for (const f of fails) console.log(`  ${f}`);
    for (const f of fails) {
      const id = f.split(":")[0];
      for (const w of (where[id] || []).slice(0, 5)) console.log(`        ${path.relative(ROOT, w.split(":")[0])}  ×${w.split(":").pop()}`);
    }
  }
  console.log(fails.length ? `\nRESULT: FAIL — ${fails.length} pile(s) over budget.` : `\nRESULT: pass — every pile within budget.`);
  process.exit(fails.length ? 1 : 0);
}
