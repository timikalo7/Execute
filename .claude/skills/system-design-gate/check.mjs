#!/usr/bin/env node
/**
 * system-design gate — the mechanically-checkable slice of Execute's system-design law
 * (memory/security-and-system-design-master.md + memory/system-design-security-checklist.md),
 * runnable so it can BLOCK a push instead of being remembered. The reasoning half (authz/IDOR/
 * business-logic/race conditions) stays with the security-reviewer agent — this gate guarantees
 * the checkable part is never skipped.
 *
 * FAIL (exit 1):
 *   lockfile-missing        package.json present but no lockfile tracked (reproducible builds)
 *   committed-env-file      a real .env tracked by git
 *   missing-env-example     code reads non-public process.env.* but no .env.example documents them
 *   missing-setup-keys      TODO(keys) markers but no SETUP-KEYS.md
 *   missing-project-log     projects/<p> has no PROJECT-LOG.md (the learning loop's substrate)
 *   sql-interpolation       string-built SQL (`query(`…${…}`)`) — parameterize instead
 *   token-in-localstorage   auth token/jwt/secret stored in localStorage (XSS-exfiltratable)
 * WARN (reported, non-blocking):
 *   no-rate-limit-reference API/server code present but nothing mentions rate limiting
 *   fetch-no-timeout        server-side fetch without AbortSignal/timeout (hung-dependency risk)
 *
 * Usage: node check.mjs --dir <project-dir> [--no-log-required]
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const arg = (f, d) => {
  const i = process.argv.indexOf(f);
  return i === -1 ? d : process.argv[i + 1];
};
const ROOT = path.resolve(arg("--dir", process.cwd()));
const REQUIRE_LOG = !process.argv.includes("--no-log-required") && /(^|\/)projects\//.test(ROOT + "/");

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", "coverage", ".turbo",
  "vendor", ".vercel", ".cache", "__pycache__", ".expo",
]);
const CODE_EXT = /\.(js|ts|jsx|tsx|mjs|cjs|py|go|rb|php|java|rs)$/i;

const findings = [];
const add = (sev, rule, file, line, text) =>
  findings.push({ sev, rule, file: path.relative(ROOT, file), line, text: (text || "").trim().slice(0, 120) });

// --- collect source files -----------------------------------------------------------------
const files = [];
(function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name)); }
    else if (e.isFile() && CODE_EXT.test(e.name)) files.push(path.join(dir, e.name));
  }
})(ROOT);

// --- 1. lockfile committed when package.json exists ----------------------------------------
const hasPkg = fs.existsSync(path.join(ROOT, "package.json"));
if (hasPkg) {
  const locks = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "bun.lock"];
  let tracked = [];
  try { tracked = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" }).split("\n"); } catch {}
  if (!locks.some((l) => tracked.includes(l) || fs.existsSync(path.join(ROOT, l))))
    add("fail", "lockfile-missing", path.join(ROOT, "package.json"), 0, "no lockfile — builds not reproducible, deps unpinned");
}

// --- 2. tracked .env ------------------------------------------------------------------------
try {
  for (const f of execSync("git ls-files", { cwd: ROOT, encoding: "utf8" }).split("\n")) {
    if (/(^|\/)\.env(\.|$)/.test(f) && !/\.(example|sample|template)$/.test(f))
      add("fail", "committed-env-file", path.join(ROOT, f), 0, f);
  }
} catch {}

// --- 3–8. per-file scans ---------------------------------------------------------------------
const PUBLIC_ENV = /^(NEXT_PUBLIC_|VITE_|PUBLIC_|REACT_APP_|EXPO_PUBLIC_)/;
const BUILTIN_ENV = new Set(["NODE_ENV", "CI", "PORT", "HOME", "PATH", "PWD", "TZ", "NEXT_RUNTIME", "VERCEL", "npm_lifecycle_event"]);
const envVars = new Set();
let todoKeys = 0;
let serverish = false;
let rateLimitRef = false;

for (const fp of files) {
  let src;
  try { if (fs.statSync(fp).size > 1_000_000) continue; src = fs.readFileSync(fp, "utf8"); } catch { continue; }
  const rel = path.relative(ROOT, fp);
  if (/(^|\/)(app\/api|pages\/api|server|api|routes?)\//.test(rel)) serverish = true;
  if (/rate.?limit/i.test(src)) rateLimitRef = true;

  src.split("\n").forEach((ln, i) => {
    for (const m of ln.matchAll(/\bprocess\.env\.([A-Z][A-Z0-9_]*)/g)) {
      const v = m[1];
      if (!PUBLIC_ENV.test(v) && !BUILTIN_ENV.has(v)) envVars.add(v);
    }
    if (/TODO\(keys\)/.test(ln)) todoKeys++;
    if (/\b(query|execute|raw)\s*\(\s*`[^`]*\$\{/.test(ln))
      add("fail", "sql-interpolation", fp, i + 1, ln);
    if (/localStorage\.setItem\(\s*['"`][^'"`]*(token|jwt|secret|password)/i.test(ln))
      add("fail", "token-in-localstorage", fp, i + 1, ln);
    if (/(^|\/)(app\/api|pages\/api|server)\//.test(rel) && /\bfetch\s*\(/.test(ln) && !/signal|timeout|AbortSignal/.test(src))
      add("warn", "fetch-no-timeout", fp, i + 1, ln);
  });
}

if (envVars.size && !fs.existsSync(path.join(ROOT, ".env.example")))
  add("fail", "missing-env-example", path.join(ROOT, ".env.example"), 0,
    `code reads: ${[...envVars].slice(0, 8).join(", ")} — document them in .env.example`);

if (todoKeys && !fs.existsSync(path.join(ROOT, "SETUP-KEYS.md")))
  add("fail", "missing-setup-keys", path.join(ROOT, "SETUP-KEYS.md"), 0,
    `${todoKeys} TODO(keys) marker(s) but no SETUP-KEYS.md`);

if (REQUIRE_LOG && !fs.existsSync(path.join(ROOT, "PROJECT-LOG.md")))
  add("fail", "missing-project-log", path.join(ROOT, "PROJECT-LOG.md"), 0,
    "no PROJECT-LOG.md — the learner has nothing to read; create it (went well / broke+fix / decisions)");

if (serverish && !rateLimitRef)
  add("warn", "no-rate-limit-reference", ROOT, 0,
    "API/server code present but nothing references rate limiting — Execute hard rule");

// --- report -----------------------------------------------------------------------------------
const fails = findings.filter((f) => f.sev === "fail");
const warns = findings.filter((f) => f.sev === "warn");
console.log(`\nsystem-design-gate — ${path.relative(process.cwd(), ROOT) || "."}`);
const show = (list, label) => {
  if (!list.length) return;
  console.log(`${label} (${list.length}):`);
  for (const f of list) console.log(`  ${f.rule}  ${f.file}${f.line ? ":" + f.line : ""}\n    ${f.text}`);
};
show(fails, "FAIL");
show(warns, "WARN (review, non-blocking)");
console.log(fails.length
  ? `RESULT: FAIL — ${fails.length} blocking finding(s).`
  : `RESULT: pass — 0 blocking findings${warns.length ? `, ${warns.length} warning(s)` : ""}.`);
process.exit(fails.length ? 1 : 0);
