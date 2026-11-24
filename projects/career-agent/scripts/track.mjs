#!/usr/bin/env node
/**
 * APPLICATION TRACKER — the least glamorous part and probably the most valuable.
 *
 * Nobody keeps this up by hand past about application fifteen, which is why follow-ups quietly stop
 * happening exactly when the pipeline gets big enough to matter.
 *
 * Usage:
 *   npm run track -- add "Stripe" "Software Engineer Intern" [--url <link>] [--deadline YYYY-MM-DD]
 *   npm run track -- status <id> applied|screening|interview|offer|rejected|withdrawn [--note "..."]
 *   npm run track -- list [--due]        # --due shows only what needs chasing today
 *   npm run track -- stats
 *   npm run track -- ignore <url> [--why "..."]   # never surface this posting again
 *   npm run track -- unignore <url>               # undo that
 *   npm run track -- ignored                      # what is currently hidden, and why
 *
 * `ignore` exists so a posting you dismissed is never shown to you again. Applying already hid a
 * row; dismissing one had no way to. Both feed the same decided-set in `decisions.mjs`, which every
 * surface filters on.
 */

import fs from "node:fs";
import path from "node:path";
import { loadIgnored, saveIgnored, normalizeUrl } from "./decisions.mjs";

const FILE = path.join(process.cwd(), "applications", "applications.json");
const STAGES = ["draft", "applied", "screening", "interview", "offer", "rejected", "withdrawn"];
const OPEN = new Set(["draft", "applied", "screening", "interview"]);
const FOLLOW_UP_DAYS = 10; // chase after ~10 days of silence; sooner reads as pushy, later is forgotten

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function load() {
  if (!fs.existsSync(FILE)) return { applications: [] };
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}
function save(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2) + "\n");
}
const flag = (args, name) => {
  const i = args.indexOf("--" + name);
  return i >= 0 ? args[i + 1] : undefined;
};

const args = process.argv.slice(2);
const cmd = args[0];
const db = load();

if (cmd === "add") {
  const [, company, role] = args;
  if (!company || !role) {
    console.error('usage: npm run track -- add "Company" "Role" [--url <link>] [--deadline YYYY-MM-DD]');
    process.exit(2);
  }
  const id = `${company}-${role}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (db.applications.some((a) => a.id === id)) {
    console.error(`already tracked: ${id} — use 'status' to update it`);
    process.exit(1);
  }
  db.applications.push({
    id,
    company,
    role,
    url: flag(args, "url") || null,
    deadline: flag(args, "deadline") || null,
    stage: "draft",
    created: today(),
    last_action: today(),
    follow_up_due: addDays(today(), FOLLOW_UP_DAYS),
    history: [{ date: today(), stage: "draft", note: "created" }],
  });
  save(db);
  console.log(`tracked ${id}\n  output dir: output/${id}/\n  next: write the tailored CV + letter there, then 'npm run ground -- output/${id}'`);
} else if (cmd === "status") {
  const [, id, stage] = args;
  if (!STAGES.includes(stage)) {
    console.error(`stage must be one of: ${STAGES.join(", ")}`);
    process.exit(2);
  }
  const app = db.applications.find((a) => a.id === id);
  if (!app) {
    console.error(`no such application: ${id}`);
    process.exit(1);
  }
  app.stage = stage;
  app.last_action = today();
  // A closed application should stop nagging; an open one restarts the clock from this action.
  app.follow_up_due = OPEN.has(stage) ? addDays(today(), FOLLOW_UP_DAYS) : null;
  app.history.push({ date: today(), stage, note: flag(args, "note") || "" });
  save(db);
  console.log(`${id} → ${stage}${app.follow_up_due ? ` (follow up by ${app.follow_up_due})` : ""}`);
} else if (cmd === "list") {
  const due = args.includes("--due");
  let rows = db.applications;
  if (due) rows = rows.filter((a) => a.follow_up_due && a.follow_up_due <= today());
  if (!rows.length) {
    console.log(due ? "nothing needs chasing today" : "no applications tracked yet");
    process.exit(0);
  }
  rows.sort((a, b) => (a.follow_up_due || "9999") .localeCompare(b.follow_up_due || "9999"));
  for (const a of rows) {
    const chase = a.follow_up_due && a.follow_up_due <= today() ? "  ← CHASE" : "";
    console.log(
      `${a.stage.padEnd(10)} ${a.company.padEnd(22)} ${a.role.padEnd(34)} ${(a.follow_up_due || "-").padEnd(11)}${chase}`,
    );
  }
} else if (cmd === "stats") {
  const by = {};
  for (const a of db.applications) by[a.stage] = (by[a.stage] || 0) + 1;
  const total = db.applications.length;
  const replied = db.applications.filter((a) => a.stage !== "draft" && a.stage !== "applied").length;
  console.log(`total ${total}`);
  for (const s of STAGES) if (by[s]) console.log(`  ${s.padEnd(10)} ${by[s]}`);
  if (total) console.log(`\nresponse rate: ${((100 * replied) / total).toFixed(0)}% (${replied}/${total})`);
} else if (cmd === "ignore") {
  const url = args[1];
  if (!url || url.startsWith("--")) {
    console.error('usage: npm run track -- ignore <url> [--why "not a real internship"]');
    process.exit(2);
  }
  const ignored = loadIgnored(process.cwd());
  if (ignored.some((i) => normalizeUrl(i.url) === normalizeUrl(url))) {
    console.log("already ignored — it is not being shown to you");
    process.exit(0);
  }
  ignored.push({ url, why: flag(args, "why") || undefined, at: today() });
  saveIgnored(process.cwd(), ignored);
  console.log(`ignored — ${ignored.length} posting(s) hidden. Undo with: npm run track -- unignore "${url}"`);
} else if (cmd === "unignore") {
  const url = args[1];
  if (!url) { console.error("usage: npm run track -- unignore <url>"); process.exit(2); }
  const ignored = loadIgnored(process.cwd());
  const kept = ignored.filter((i) => normalizeUrl(i.url) !== normalizeUrl(url));
  if (kept.length === ignored.length) {
    console.error("that posting was not ignored — nothing changed");
    process.exit(1);
  }
  saveIgnored(process.cwd(), kept);
  console.log(`un-ignored — it will appear again. ${kept.length} still hidden.`);
} else if (cmd === "ignored") {
  const ignored = loadIgnored(process.cwd());
  if (!ignored.length) { console.log("nothing ignored yet"); process.exit(0); }
  for (const i of ignored) console.log(`${(i.at || "-").padEnd(11)} ${i.why ? `(${i.why}) ` : ""}${i.url}`);
  console.log(`\n${ignored.length} hidden`);
} else {
  console.error(`usage:
  npm run track -- add "Company" "Role" [--url <link>] [--deadline YYYY-MM-DD]
  npm run track -- status <id> ${STAGES.join("|")} [--note "..."]
  npm run track -- list [--due]
  npm run track -- stats
  npm run track -- ignore <url> [--why "..."]
  npm run track -- unignore <url>
  npm run track -- ignored`);
  process.exit(2);
}
