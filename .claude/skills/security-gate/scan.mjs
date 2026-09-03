#!/usr/bin/env node
/**
 * security-gate scan — the security counterpart to visual-qa: a RUNNABLE gate that fails
 * (non-zero exit) on real, high-signal problems instead of relying on self-attestation.
 *
 * Checks:
 *   1. Hardcoded secrets in source (private keys, AWS/GitHub/Slack/Stripe/Google tokens,
 *      generic `secret/api_key/token = "…"` with a real-looking value).
 *   2. TLS verification disabled (`rejectUnauthorized: false`, NODE_TLS_REJECT_UNAUTHORIZED=0).
 *   3. `.env` files tracked by git (only *.example/.sample/.template are allowed).
 *   4. `npm audit` → fail on high/critical advisories (when a package.json exists).
 *   5. Payment-webhook endpoints that read a body but never verify a signature (FAIL).
 *   6. Warnings (reported, don't fail): insecure http:// literals, eval/new Function on
 *      non-constants, XSS sinks (innerHTML/document.write/v-html), child_process with
 *      interpolation, file uploads with no visible type/size check.
 *
 * Usage:  node scan.mjs --dir <project> [--audit-level high] [--staged]
 * Exit:   1 if any FAIL-severity finding; 0 otherwise. Writes report.json to the dir.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const __dirname_gate = path.dirname(fileURLToPath(import.meta.url));

const arg = (f, d) => {
  const i = process.argv.indexOf(f);
  return i === -1 ? d : process.argv[i + 1];
};
const has = (f) => process.argv.includes(f);
const ROOT = path.resolve(arg("--dir", process.cwd()));
const AUDIT_LEVEL = arg("--audit-level", "high");
const SELF = path.resolve(new URL(import.meta.url).pathname); // never scan this scanner's own rule docs

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", "coverage", ".turbo",
  "vendor", ".vercel", "pw-browsers", ".cache", "__pycache__",
]);
// --exclude a,b — extra dir names to skip for this run (e.g. the pre-push gate scans the repo
// root with `--exclude projects,skill-library`: projects are scanned individually, and the
// vendored skill-library contains third-party example code that isn't ours to gate).
for (const d of (arg("--exclude", "") || "").split(",").filter(Boolean)) SKIP_DIRS.add(d.trim());
/*
 * Paths skipped by their position rather than their name. A subagent launched with worktree
 * isolation gets a git worktree under .claude/worktrees/<agent> — a second checkout of THIS repo.
 * Scanning it counts every file in the repository twice, so a push made while an agent is running
 * doubled every warning pile and failed against budgets that were fine. That is a bug in the gate,
 * not debt in the tree: the fix is to stop counting the same file twice, not to raise the budget.
 * The worktree's own contents are gated when its branch is merged and pushed on its own.
 */
const SKIP_RELS = new Set([".claude/worktrees"]);
const SKIP_FILE = /\.(min\.(js|css)|map|png|jpe?g|gif|webp|ico|svg|woff2?|ttf|pdf|mp4|webm|zip|lock)$|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|security-gate-report\.json/i;
const TEXT_EXT = /\.(js|ts|jsx|tsx|mjs|cjs|json|env|ya?ml|toml|py|go|rb|php|java|rs|sh|html?|css|tf|ini|conf|cfg|properties|gradle|Dockerfile)$/i;

// high-signal secret patterns
const SECRET_RULES = [
  { id: "private-key", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/ },
  { id: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "github-token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{22,}/ },
  { id: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { id: "stripe-secret", re: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}/ },
  { id: "google-api-key", re: /\bAIza[0-9A-Za-z_\-]{35}\b/ },
  /*
   * The two providers this repo actually uses had no rule at all. AWS, GitHub, Slack, Stripe and
   * Google were covered; Anthropic and OpenAI, the keys every project here is built around, were
   * not. A probe file holding `const k = "sk-ant-api03-..."` passed the gate clean, because the
   * generic assignment rule only fires when the VARIABLE is named like a secret, and this one was
   * named `k`. Found while proving an unrelated fix was narrow — which is the argument for testing
   * that a gate fails, rather than only watching it pass.
   */
  { id: "anthropic-key", re: /\bsk-ant-(?:api|admin)[0-9]{2}-[A-Za-z0-9_\-]{20,}/ },
  { id: "openai-key", re: /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_\-]{20,}|\bsk-[A-Za-z0-9]{48}\b/ },
  { id: "generic-secret-assignment", re: /\b(?:api[_-]?key|secret|client[_-]?secret|access[_-]?token|auth[_-]?token|password|passwd)\s*[:=]\s*['"`][^'"`\n]{12,}['"`]/i },
];
const PLACEHOLDER = /example|placeholder|dummy|sample|changeme|your[_-]?|xxxx|<[^>]+>|\$\{|process\.env|import\.meta\.env|redacted|todo|test[_-]?key|fake/i;

const WARN_RULES = [
  { id: "tls-verify-disabled", sev: "fail", re: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/ },
  // `skip` is a second regex that vetoes a match on the same line. Two rules below fire constantly
  // on code that is not doing the thing they name, and a warning pile that is mostly false is a
  // warning pile nobody reads — which is how a real finding gets buried.
  {
    id: "insecure-http", sev: "warn",
    re: /["'`]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/,
    // An XML namespace URI is an identifier, not an address. `http://www.w3.org/2000/svg` is never
    // fetched, over any protocol, and every SVG-building line in the repo was being reported as an
    // insecure request. Keyed on the namespace APIs rather than on a host allowlist, so a genuine
    // `fetch("http://www.w3.org/...")` is still caught.
    skip: /createElementNS|setAttributeNS|getAttributeNS|createAttributeNS|\bxmlns\b|<!DOCTYPE|\bxsi:|\bxsd:/,
  },
  {
    id: "eval-usage", sev: "warn",
    // `\beval` matched inside Playwright's `page.$eval(` and `page.$$eval(`, because `$` is a
    // non-word character and so `\b` sits happily between it and the `e`. Those are DOM query
    // helpers with nothing to do with the evaluator. Excluding `$` and word characters before
    // `eval` drops them while still catching bare `eval(`, `window.eval(` and `obj.eval(`.
    re: /(?<![$\w])eval\s*\(|new\s+Function\s*\(/,
  },
  // XSS sinks. Kept at WARN on purpose: a line-based regex cannot tell whether the assigned value
  // is a constant or user input, and a FAIL that fires on `el.innerHTML = ""` would get bypassed,
  // which is worse than a warning that gets read.
  { id: "dangerous-html", sev: "warn", re: /dangerouslySetInnerHTML|\.(?:inner|outer)HTML\s*=(?!=)|\bdocument\.write(?:ln)?\s*\(|\bv-html\b|\$\([^)]*\)\.html\s*\(/ },
  { id: "shell-interpolation", sev: "warn", re: /exec(?:Sync)?\s*\(\s*[`'"][^`'"]*\$\{/ },
];

/**
 * FILE-LEVEL rules — "this file does X but never does Y".
 *
 * The rules above read one line at a time, which is the right shape for "this line contains a
 * secret". It is the wrong shape for the two most expensive vibecoded-app mistakes, because both
 * are about something MISSING: a webhook handler that never verifies a signature, and an upload
 * handler that never checks type or size. Absence has no line number, so these run over the whole
 * file and report at line 0.
 */
const FILE_RULES = [
  {
    id: "webhook-unverified",
    sev: "fail",
    // Trigger only on a file that really is a webhook endpoint: it is NAMED like one AND it reads a
    // request body. Both halves matter — "webhook" appearing in a comment or a docs page is not an
    // endpoint, and a tight trigger is what keeps a blocking rule from being bypassed.
    applies: (file, src) =>
      /webhook/i.test(file) &&
      /\breq(?:uest)?\.(?:body|text|json|rawBody)\b|\brawBody\b|await\s+req(?:uest)?\.text\s*\(/.test(src),
    // Any recognised signature check clears it: Stripe's own helper, a generic HMAC compare, or one
    // of the common webhook-verification libraries.
    satisfied: (src) =>
      /constructEvent|webhooks?\.(?:constructEvent|verify|signature)|createHmac|timingSafeEqual|verifyHeader|new\s+Webhook\s*\(|svix|verifySignature|X-Hub-Signature|stripe-signature/i.test(src),
    msg: "webhook endpoint reads the request body but never verifies a signature — anyone who can POST to this URL can forge a 'payment succeeded' event",
  },
  {
    id: "upload-no-validation",
    // WARN, not FAIL: validation legitimately lives in middleware, a schema, or the storage
    // provider's own config, and this file cannot see that. Reported so a human looks, not to block.
    sev: "warn",
    applies: (file, src) =>
      /multer|formidable|busboy|multipart\/form-data|\bnew\s+FormData\b|\bfiles?\[|req\.files?\b/.test(src) &&
      !/\.test\.|\.spec\./.test(file),
    satisfied: (src) =>
      /mimetype|mimeType|content-type|contentType|fileFilter|allowed(?:Types|Extensions|Mime)|limits\s*:|maxFileSize|fileSize|accept\s*[:=]/i.test(src),
    msg: "handles file uploads with no visible type or size check — verify the file type and size, block executable extensions (.php/.jsp/.phtml), and store uploads where they can never be executed",
  },
];

const findings = [];
/**
 * --selftest — check the checker.
 *
 * This gate had no selftest at all, which is how two rules spent an unknown length of time
 * reporting code that was not doing the thing they name. Every assertion below comes in a pair: a
 * line that MUST be caught and a line that MUST NOT be. A rule proven only to pass on good input
 * has not been shown to work, and a rule proven only to fire is just noise with a severity.
 */
function selftest() {
  const cases = [
    // [rule id, line, should it fire?]
    ["insecure-http", 'fetch("http://api.example.com/v1")', true],
    ["insecure-http", 'const base = "http://internal.corp/api"', true],
    ["insecure-http", 'fetch("https://api.example.com/v1")', false],
    ["insecure-http", 'fetch("http://localhost:3000/x")', false],
    // the false positives that motivated the fix
    ["insecure-http", `document.createElementNS('http://www.w3.org/2000/svg', 'svg')`, false],
    ["insecure-http", `el.setAttributeNS('http://www.w3.org/1999/xlink', 'href', u)`, false],
    ["insecure-http", `<svg xmlns="http://www.w3.org/2000/svg">`, false],
    // but a real insecure fetch of a w3.org URL is still a finding
    ["insecure-http", 'await fetch("http://www.w3.org/TR/spec.html")', true],

    ["eval-usage", "eval(userInput)", true],
    ["eval-usage", "window.eval(payload)", true],
    ["eval-usage", "sandbox.eval(code)", true],
    ["eval-usage", "const f = new Function('a', body)", true],
    // the false positives that motivated the fix
    ["eval-usage", "const v = await page.$eval('#x', (e) => e.textContent)", false],
    ["eval-usage", "const all = await page.$$eval('a', (els) => els.length)", false],
    // and a word merely containing "eval" is not a call
    ["eval-usage", "const retrieval = (x) => x", false],
    ["eval-usage", "medievalStyle(x)", false],

    ["tls-verify-disabled", "const agent = new https.Agent({ rejectUnauthorized: false })", true],
    ["tls-verify-disabled", "const agent = new https.Agent({ rejectUnauthorized: true })", false],
    ["shell-interpolation", "execSync(`rm -rf ${dir}`)", true],
    ["shell-interpolation", 'execSync("rm -rf /tmp/fixed")', false],
    ["dangerous-html", "el.innerHTML = value", true],
    ["dangerous-html", "if (el.innerHTML === value) return", false],
  ];

  let failed = 0;
  for (const [id, line, want] of cases) {
    const r = WARN_RULES.find((x) => x.id === id);
    if (!r) { console.log(`FAIL no such rule: ${id}`); failed++; continue; }
    const got = r.re.test(line) && !(r.skip && r.skip.test(line));
    const ok = got === want;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${id} ${want ? "catches" : "ignores"}: ${line}`);
  }
  console.log(`\n${cases.length - failed}/${cases.length} assertions passed`);
  return failed === 0 ? 0 : 1;
}

if (has("--selftest")) process.exit(selftest());

function add(sev, rule, file, line, text) {
  findings.push({ sev, rule, file: path.relative(ROOT, file), line, text: text.trim().slice(0, 140) });
}

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      const rel = path.relative(ROOT, path.join(dir, e.name));
      if (!SKIP_DIRS.has(e.name) && !SKIP_RELS.has(rel)) walk(path.join(dir, e.name));
    } else if (e.isFile() && !SKIP_FILE.test(e.name) && (TEXT_EXT.test(e.name) || e.name.startsWith(".env"))) {
      const fp = path.join(dir, e.name);
      if (path.resolve(fp) === SELF) continue;
      let src;
      try {
        if (fs.statSync(fp).size > 1_000_000) continue;
        src = fs.readFileSync(fp, "utf8");
      } catch {
        continue;
      }
      for (const r of FILE_RULES) {
        if (r.applies(fp, src) && !r.satisfied(src)) add(r.sev, r.id, fp, 0, r.msg);
      }
      src.split("\n").forEach((ln, i) => {
        for (const r of SECRET_RULES) {
          if (r.re.test(ln) && !PLACEHOLDER.test(ln)) {
            // NEXT_PUBLIC_/VITE_/PUBLIC_ prefixed values are intentionally public — only the
            // strong token patterns matter there; skip the generic assignment rule for them.
            if (r.id === "generic-secret-assignment" && /\b(?:NEXT_PUBLIC|VITE|PUBLIC|REACT_APP)_/.test(ln)) continue;
            add("fail", `secret:${r.id}`, fp, i + 1, ln);
          }
        }
        for (const r of WARN_RULES) {
          if (r.re.test(ln) && !(r.skip && r.skip.test(ln))) add(r.sev, r.id, fp, i + 1, ln);
        }
      });
    }
  }
}
walk(ROOT);

// .env files tracked by git
try {
  const tracked = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" }).split("\n");
  for (const f of tracked) {
    if (/(^|\/)\.env(\.|$)/.test(f) && !/\.(example|sample|template)$/.test(f)) {
      add("fail", "committed-env-file", path.join(ROOT, f), 0, f);
    }
  }
} catch { /* not a git repo */ }

/**
 * ACCEPTED ADVISORIES — narrow, dated, and per-advisory.
 *
 * Some advisories have no fix to apply. `projects/example-app` hit the real version of this: all 22 of its
 * remaining high advisories trace to ONE root — two DoS bugs in `image-size`, a build-time image
 * dimension reader pulled in by metro — and **`image-size@2.0.2` is the latest published version while
 * the advisory covers `<=2.0.2`**. There is nothing to upgrade to. npm's suggested "fix" is
 * `react-native@0.72.17`, a metro old enough to predate the dependency, which is a multi-year
 * downgrade rather than a patch.
 *
 * The tempting move at that point is to lower `--audit-level` so the push passes. **That is the
 * weaken-the-gate failure**: it silently stops catching the NEXT advisory too, including a real one.
 *
 * So an exception is per-advisory and it EXPIRES. `security-exceptions.json` in the project names each
 * accepted GHSA id, why, and a review date. Anything not named still fails. An expired entry fails
 * LOUDER than the advisory did, because a forgotten exception is worse than an open finding.
 */
function loadExceptions(dir) {
  const f = path.join(dir, "security-exceptions.json");
  if (!fs.existsSync(f)) return [];
  try {
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    return Array.isArray(j.accepted) ? j.accepted : [];
  } catch {
    return [];
  }
}

// npm audit (dependency vulnerabilities)
let audit = "skipped (no package.json)";
if (fs.existsSync(path.join(ROOT, "package.json"))) {
  const accepted = loadExceptions(ROOT);
  const today = new Date().toISOString().slice(0, 10);
  try {
    execSync(`npm audit --audit-level=${AUDIT_LEVEL} --json`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    audit = "0 high/critical";
  } catch (e) {
    try {
      const j = JSON.parse(e.stdout || "{}");
      const v = j.metadata?.vulnerabilities || {};
      const hi = (v.high || 0) + (v.critical || 0);

      // Collect the ROOT advisories — the ones with a real title and GHSA url. Everything else in an
      // npm audit count is inheritance: a package flagged only because something it depends on is.
      // Counting inheritance makes 2 real problems look like 22 and buries the two that matter.
      const roots = new Map();
      for (const [pkg, a] of Object.entries(j.vulnerabilities || {})) {
        if (!["high", "critical"].includes(a.severity)) continue;
        for (const via of a.via || []) {
          if (typeof via === "object" && via.url) roots.set(via.url, { name: via.name, title: via.title, sev: via.severity, via: pkg });
        }
      }

      const ids = [...roots.keys()];
      const okIds = new Set(accepted.filter((x) => !x.expires || x.expires >= today).map((x) => x.advisory));
      const expired = accepted.filter((x) => x.expires && x.expires < today);
      const unaccepted = ids.filter((id) => !okIds.has(id));

      // An expired exception is its own failure, and a loud one.
      for (const x of expired)
        add("fail", "security-exception-expired", path.join(ROOT, "security-exceptions.json"), 0,
          `accepted advisory ${x.advisory} expired on ${x.expires} — re-check whether a fix exists now, then renew or remove it`);

      if (unaccepted.length) {
        for (const id of unaccepted) {
          const r = roots.get(id);
          add("fail", "npm-audit", path.join(ROOT, "package.json"), 0, `${r.sev}: ${r.name} — ${r.title} (${id})`);
        }
        audit = `${unaccepted.length} unaccepted root advisor(y/ies) across ${hi} flagged package(s)`;
      } else if (ids.length) {
        audit = `${hi} flagged package(s), all tracing to ${ids.length} accepted root advisor(y/ies) — see security-exceptions.json`;
      } else if (hi > 0) {
        // Flagged with no resolvable root — report it rather than passing silently.
        add("fail", "npm-audit", path.join(ROOT, "package.json"), 0, `${v.critical || 0} critical, ${v.high || 0} high`);
        audit = `${hi} high/critical`;
      } else {
        audit = `0 high/critical (mod:${v.moderate || 0} low:${v.low || 0})`;
      }
    } catch {
      audit = "could not run (network/registry?) — audit deps manually";
    }
  }
}

// Optional deeper pass: if semgrep is installed, run a security ruleset (dataflow/taint catches
// some authz/injection a regex can't). Opportunistic — skipped cleanly when absent or offline.
let semgrep = "skipped (not installed)";
const haveSemgrep = (() => {
  try { execSync("semgrep --version", { stdio: "ignore" }); return true; } catch { return false; }
})();
if (haveSemgrep) {
  const cfg = process.env.SEMGREP_RULES || "p/security-audit";
  try {
    const out = execSync(`semgrep scan --config ${cfg} --severity ERROR --json --quiet .`, {
      cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 50 * 1024 * 1024,
    });
    const res = JSON.parse(out).results || [];
    for (const r of res) {
      add("fail", `semgrep:${r.check_id?.split(".").pop() || "rule"}`,
        path.join(ROOT, r.path), r.start?.line || 0, r.extra?.message || r.check_id || "");
    }
    semgrep = `${res.length} ERROR finding(s)`;
  } catch {
    semgrep = "could not run (rules need network?) — run `semgrep` manually";
  }
}

const fails = findings.filter((f) => f.sev === "fail");
const warns = findings.filter((f) => f.sev === "warn");
fs.writeFileSync(path.join(ROOT, "security-gate-report.json"), JSON.stringify({ audit, findings }, null, 2));

console.log(`\nsecurity-gate — ${path.relative(process.cwd(), ROOT) || "."}`);
console.log(`npm audit: ${audit}`);
console.log(`semgrep:   ${semgrep}`);
const show = (list, label) => {
  if (!list.length) return;
  console.log(`\n${label} (${list.length}):`);
  for (const f of list) console.log(`  ${f.rule}  ${f.file}:${f.line}\n    ${f.text}`);
};
show(fails, "FAIL");
show(warns, "WARN (review, non-blocking)");
/* ---------------------------------------------------------------------------
 * THE RATCHET — the answer to "detected, never prevented".
 *
 * These WARN rules printed 71 findings on every single push for weeks and blocked nothing. A
 * warning nobody acts on is not a safety net, it is scrollback: the pile only ever grew, and a
 * genuinely new unvalidated upload handler would have arrived invisibly among fifty old ones.
 *
 * Deliberately NOT solved by promoting them to FAIL — the reasons they are warnings are still true
 * (a line-based regex cannot see that a value was escaped two lines earlier). Solved by budgeting:
 * each rule carries a reviewed count and a reason. Over budget FAILS the push. Under budget rewrites
 * the budget DOWN, so improvement is locked in and cannot silently regress. A rule that fires with
 * no budget entry fails too, so a new class of problem cannot arrive quietly.
 *
 * The number can only go down. That is the whole mechanism.
 * ------------------------------------------------------------------------- */
/*
 * SCOPE. Caught by running it, one commit after the ratchet shipped: the pre-push hook never scans
 * the whole repo. It scans the root with `--exclude projects,skill-library,security-gate`, then each
 * touched project separately. Every one of those is a SUBSET, so a whole-repo budget is meaningless
 * against them — and a subset legitimately under budget ratcheted `dangerous-html` from 50 down to
 * 5, after which a full scan failed against a budget it could never meet. The mechanism was correct
 * and the configuration it actually runs in was not, which is the entire argument for running a
 * thing rather than reasoning about it.
 *
 * So the budget is keyed by scan scope. An unseen scope is baselined on its first run — the goal is
 * to stop the number GROWING from here, not to audit history, and this is how every ratchet
 * bootstraps. From that point growth in that scope fails.
 */
const BUDGET_FILE = path.join(__dirname_gate, "warning-budget.json");

/**
 * A scan of a throwaway directory must not leave a permanent budget entry behind.
 *
 * `self-test.mjs` builds fixture trees with `fs.mkdtempSync(os.tmpdir(), "secgate-")` and scans each
 * one. Every such scope is unique and never seen again, so the scanner treated each as a first
 * sighting and wrote a baseline for it — and eighteen dead `../../../tmp/secgate-XXXXXX` entries had
 * accumulated in the COMMITTED warning-budget.json, one per self-test run, growing without bound.
 * They can never ratchet, because their directories no longer exist; they are write-only noise in a
 * file whose whole purpose is to be reviewed by a human.
 *
 * This does not weaken the ratchet. The scan still runs, still counts, still enforces in-memory for
 * that run. Only the PERSISTENCE is skipped, and only for a scope inside the OS temp directory,
 * which is never a real project. Real scopes — `.`, `projects/<name>` — are unaffected, and the
 * pre-push gate uses exactly those.
 */
const isEphemeralScope = (() => {
  const tmp = fs.realpathSync(os.tmpdir());
  let root;
  try { root = fs.realpathSync(ROOT); } catch { root = path.resolve(ROOT); }
  return root === tmp || root.startsWith(tmp + path.sep);
})();

const SCOPE = (() => {
  const rel = path.relative(process.cwd(), ROOT) || ".";
  const ex = (arg("--exclude", "") || "").split(",").map((x) => x.trim()).filter(Boolean).sort();
  return ex.length ? `${rel} !${ex.join("+")}` : rel;
})();
const warnCounts = {};
for (const w of warns) warnCounts[w.rule] = (warnCounts[w.rule] || 0) + 1;

let budgetDoc = null;
try { budgetDoc = JSON.parse(fs.readFileSync(BUDGET_FILE, "utf8")); } catch { budgetDoc = null; }

const ratchetFails = [];
const ratchetDowns = [];
if (budgetDoc) {
  budgetDoc.scopes = budgetDoc.scopes || {};
  if (!budgetDoc.scopes[SCOPE]) {
    // First sighting of this scope: baseline it, say so loudly, and enforce from the next run.
    budgetDoc.scopes[SCOPE] = Object.fromEntries(Object.entries(warnCounts).map(([r, c]) => [r, {
      max: c, reason: `auto-baselined on first scan of this scope`, reviewed: new Date().toISOString().slice(0, 10),
    }]));
    if (!isEphemeralScope) fs.writeFileSync(BUDGET_FILE, JSON.stringify(budgetDoc, null, 2) + "\n");
    console.log(`\nBUDGET BASELINED for a new scan scope "${SCOPE}" — ${warns.length} warning(s) recorded. Growth fails from the next run.`);
  }
  const budget = budgetDoc.scopes[SCOPE];
  for (const [rule, count] of Object.entries(warnCounts)) {
    const entry = budget[rule];
    if (!entry) {
      ratchetFails.push(`[${SCOPE}] ${rule}: ${count} warning(s) and NO budget entry — a new class of finding must be accepted explicitly (add it to warning-budget.json with a reason) or fixed`);
      continue;
    }
    if (!entry.reason || /^TODO/.test(entry.reason)) {
      ratchetFails.push(`[${SCOPE}] ${rule}: budgeted at ${entry.max} with no reason recorded — an accepted warning needs a stated reason`);
      continue;
    }
    if (count > entry.max) {
      ratchetFails.push(`[${SCOPE}] ${rule}: ${count} warning(s), budget ${entry.max} — ${count - entry.max} NEW since the budget was reviewed. Fix them, or raise the budget deliberately in its own commit with the reason.`);
    } else if (count < entry.max) {
      ratchetDowns.push(`${rule}: ${entry.max} → ${count}`);
      entry.max = count;
      entry.reviewed = new Date().toISOString().slice(0, 10);
    }
  }
  if (ratchetDowns.length && !ratchetFails.length) {
    // Same rule as the baseline write: a throwaway scope leaves nothing behind.
    if (!isEphemeralScope) fs.writeFileSync(BUDGET_FILE, JSON.stringify(budgetDoc, null, 2) + "\n");
    console.log(`\nBUDGET RATCHETED DOWN for "${SCOPE}" (locked in, cannot regress):`);
    for (const r of ratchetDowns) console.log(`  ${r}`);
  }
  if (ratchetFails.length) {
    console.log(`\nWARNING BUDGET EXCEEDED (${ratchetFails.length}):`);
    for (const r of ratchetFails) console.log(`  ${r}`);
  }
} else {
  console.log(`\n(no warning-budget.json — warnings are unbudgeted, which is the state this file exists to end)`);
}

const blocking = fails.length + ratchetFails.length;
console.log(
  blocking
    ? `\nRESULT: FAIL — ${fails.length} blocking finding(s)${ratchetFails.length ? ` + ${ratchetFails.length} over budget` : ""}. Fix or justify before shipping.`
    : `\nRESULT: pass — 0 blocking findings${warns.length ? `, ${warns.length} warning(s), all within budget` : ""}.`,
);
process.exit(blocking ? 1 : 0);
