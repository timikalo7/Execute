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
 *   5. Warnings (reported, don't fail): insecure http:// literals, eval/new Function on
 *      non-constants, dangerouslySetInnerHTML, child_process with interpolation.
 *
 * Usage:  node scan.mjs --dir <project> [--audit-level high] [--staged]
 * Exit:   1 if any FAIL-severity finding; 0 otherwise. Writes report.json to the dir.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

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
  { id: "generic-secret-assignment", re: /\b(?:api[_-]?key|secret|client[_-]?secret|access[_-]?token|auth[_-]?token|password|passwd)\s*[:=]\s*['"`][^'"`\n]{12,}['"`]/i },
];
const PLACEHOLDER = /example|placeholder|dummy|sample|changeme|your[_-]?|xxxx|<[^>]+>|\$\{|process\.env|import\.meta\.env|redacted|todo|test[_-]?key|fake/i;

const WARN_RULES = [
  { id: "tls-verify-disabled", sev: "fail", re: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/ },
  { id: "insecure-http", sev: "warn", re: /["'`]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/ },
  { id: "eval-usage", sev: "warn", re: /\beval\s*\(|new\s+Function\s*\(/ },
  { id: "dangerous-html", sev: "warn", re: /dangerouslySetInnerHTML/ },
  { id: "shell-interpolation", sev: "warn", re: /exec(?:Sync)?\s*\(\s*[`'"][^`'"]*\$\{/ },
];

const findings = [];
function add(sev, rule, file, line, text) {
  findings.push({ sev, rule, file: path.relative(ROOT, file), line, text: text.trim().slice(0, 140) });
}

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name));
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
          if (r.re.test(ln)) add(r.sev, r.id, fp, i + 1, ln);
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

// npm audit (dependency vulnerabilities)
let audit = "skipped (no package.json)";
if (fs.existsSync(path.join(ROOT, "package.json"))) {
  try {
    execSync(`npm audit --audit-level=${AUDIT_LEVEL} --json`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    audit = "0 high/critical";
  } catch (e) {
    // npm audit exits non-zero when vulns >= level OR on error; parse stdout to tell which.
    try {
      const j = JSON.parse(e.stdout || "{}");
      const v = j.metadata?.vulnerabilities || {};
      const hi = (v.high || 0) + (v.critical || 0);
      if (hi > 0) {
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
console.log(
  fails.length
    ? `\nRESULT: FAIL — ${fails.length} blocking finding(s). Fix or justify before shipping.`
    : `\nRESULT: pass — 0 blocking findings${warns.length ? `, ${warns.length} warning(s) to review` : ""}.`,
);
process.exit(fails.length ? 1 : 0);
