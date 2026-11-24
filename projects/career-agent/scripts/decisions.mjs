#!/usr/bin/env node
/**
 * DECIDED — the one question every surface has to agree on: have you already dealt with this?
 *
 * Once you apply to a posting or ignore it, it should never be shown to you again. Two different
 * states, one consequence.
 *
 * ## Why this is a module and not three copies of a Set
 *
 * Three scripts surface jobs (`dashboard`, `discover`, `cowork-brief`). If each built its own idea of
 * "already applied", they would drift: the dashboard hides a row the brief still lists, and you see
 * the thing you dismissed. So the decision set is computed once, here, from both stores:
 *
 *   applications/applications.json   applied (or any later stage — screening, rejected, withdrawn)
 *   jobs/ignored.json                dismissed without applying
 *
 * A withdrawn or rejected application still counts as decided. Re-surfacing it as a fresh
 * opportunity would be the tool forgetting something you did.
 *
 * ## Matching is by URL, normalized
 *
 * The same posting arrives from two sources with different tracking parameters, and a raw string
 * compare treats those as two jobs. Normalizing strips the query string and a trailing slash.
 */
import fs from "node:fs";
import path from "node:path";

export const IGNORED_FILE = (root) => path.join(root, "jobs", "ignored.json");
export const APPLIED_FILE = (root) => path.join(root, "applications", "applications.json");

/**
 * Compare postings by their stable identity, not their decoration.
 *
 * `?utm_source=...`, `?gh_src=...` and a trailing slash are all decoration: they differ between
 * sources for the identical posting. Everything before the `?` is the identity.
 */
export function normalizeUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  return s.split("#")[0].split("?")[0].replace(/\/+$/, "").toLowerCase();
}

const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
};

export function loadIgnored(root) {
  const db = readJson(IGNORED_FILE(root), { ignored: [] });
  return Array.isArray(db.ignored) ? db.ignored : [];
}

export function saveIgnored(root, ignored) {
  const file = IGNORED_FILE(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ignored }, null, 2) + "\n");
}

export function loadApplied(root) {
  const db = readJson(APPLIED_FILE(root), { applications: [] });
  return Array.isArray(db.applications) ? db.applications : [];
}

/**
 * Every URL you have already dealt with, normalized, with WHY — so a surface can say
 * "hidden: 12 applied, 4 ignored" instead of silently dropping rows. A filter nobody can see the
 * effect of is indistinguishable from a bug.
 */
export function decisions(root) {
  const map = new Map();
  for (const a of loadApplied(root)) {
    const u = normalizeUrl(a.url);
    if (u) map.set(u, { decision: "applied", stage: a.stage, at: a.created });
  }
  for (const i of loadIgnored(root)) {
    const u = normalizeUrl(i.url);
    if (u && !map.has(u)) map.set(u, { decision: "ignored", why: i.why, at: i.at });
  }
  return map;
}

/** The predicate every surface should filter on. */
export function isDecided(decided, url) {
  return decided.has(normalizeUrl(url));
}

/** Split a list of postings into what to show and a counted summary of what was hidden. */
export function partition(rows, decided) {
  const show = [], hidden = { applied: 0, ignored: 0 };
  for (const r of rows) {
    const d = decided.get(normalizeUrl(r.url));
    if (!d) { show.push(r); continue; }
    hidden[d.decision] = (hidden[d.decision] || 0) + 1;
  }
  return { show, hidden };
}

// ---------------------------------------------------------------- self-test
//
// Guarded on being the MAIN module, not merely on argv. `process.argv` is shared with whatever
// imported this file, so an unguarded check fires on IMPORT: running `discover.mjs --self-test`
// would run THIS self-test, print a pass, and exit before discover's own self-test began.
import { fileURLToPath } from "node:url";
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain && process.argv[2] === "--self-test") {
  let pass = 0, fail = 0;
  const check = (cond, name) => { if (cond) { pass++; } else { fail++; console.error("  FAIL  " + name); } };

  check(normalizeUrl("https://x.com/job/1?utm_source=a") === "https://x.com/job/1",
    "the query string is decoration, not identity");
  check(normalizeUrl("https://X.com/job/1/") === normalizeUrl("https://x.com/job/1?gh=2"),
    "the same posting from two sources normalizes to one key");
  check(normalizeUrl("") === "" && normalizeUrl(undefined) === "",
    "a missing url does not become a key that swallows every other missing url");

  const decided = new Map([["https://a/1", { decision: "applied" }], ["https://a/2", { decision: "ignored" }]]);
  check(isDecided(decided, "https://a/1?utm=x"), "a decided posting stays decided through a tracking parameter");
  check(!isDecided(decided, "https://a/3"), "an undecided posting is not filtered");

  const { show, hidden } = partition(
    [{ url: "https://a/1" }, { url: "https://a/2" }, { url: "https://a/3" }], decided);
  check(show.length === 1 && show[0].url === "https://a/3", "only the undecided row is shown");
  check(hidden.applied === 1 && hidden.ignored === 1, "hidden rows are COUNTED, not silently dropped");

  // The negative case: a filter that hides everything is as broken as one that hides nothing.
  const none = partition([{ url: "https://a/9" }], new Map());
  check(none.show.length === 1 && none.hidden.applied === 0, "with no decisions, nothing is hidden");

  console.log(`\n${fail ? "FAIL" : "PASS"} — decisions: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
