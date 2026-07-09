#!/usr/bin/env node
/**
 * site-watchdog — daily health check for a LIVE site. A launched site nobody watches is a risk:
 * expired certs, dropped security headers after a host change, a blanked homepage, a dead form
 * endpoint — all invisible until a visitor hits them. This makes them mechanical.
 *
 * Checks (FAIL → exit 1):
 *   route-status      every configured route answers 200
 *   marker-missing    homepage body contains the expected marker text (defacement/blank-page tell)
 *   header-missing    required security headers present on /
 *   cert-expiry       TLS cert has > minCertDays left (default 21)
 * Warnings: slow responses (> slowMs, default 4000).
 *
 * Config: a watchdog.json per project — {"url","routes":[],"marker","headers":[],"minCertDays"}.
 * Usage:  node check.mjs --config projects/example-marketing-site/watchdog.json [--report /tmp/report.md]
 * Network: shells out to curl/openssl (honors HTTPS_PROXY; adds -proxy for openssl when set).
 */
import fs from "node:fs";
import { execSync } from "node:child_process";

const arg = (f, d) => {
  const i = process.argv.indexOf(f);
  return i === -1 ? d : process.argv[i + 1];
};
const cfgPath = arg("--config", null);
if (!cfgPath || !fs.existsSync(cfgPath)) {
  console.error("watchdog: --config <watchdog.json> required");
  process.exit(2);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const URL_BASE = cfg.url.replace(/\/$/, "");
const ROUTES = cfg.routes?.length ? cfg.routes : ["/"];
const MARKER = cfg.marker || "";
const REQUIRED_HEADERS = (cfg.headers?.length ? cfg.headers : [
  "strict-transport-security",
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
]).map((h) => h.toLowerCase());
const MIN_CERT_DAYS = cfg.minCertDays ?? 21;
const SLOW_MS = cfg.slowMs ?? 4000;

const sh = (cmd) => execSync(cmd, { encoding: "utf8", timeout: 30_000 });
const fails = [];
const warns = [];
const lines = [];
const note = (s) => { lines.push(s); console.log(s); };

note(`# watchdog — ${URL_BASE} — ${new Date().toISOString()}`);

// 1+2. routes: status, latency, homepage marker
for (const r of ROUTES) {
  const url = URL_BASE + r;
  try {
    const out = sh(`curl -sS -o /tmp/wd-body -w '%{http_code} %{time_total}' -L --max-time 25 '${url}'`);
    const [code, secs] = out.trim().split(" ");
    const ms = Math.round(parseFloat(secs) * 1000);
    if (code !== "200") fails.push(`route-status ${r}: HTTP ${code}`);
    else if (ms > SLOW_MS) warns.push(`slow ${r}: ${ms}ms`);
    note(`- ${r} → ${code} in ${ms}ms`);
    if (r === "/" && MARKER) {
      const body = fs.readFileSync("/tmp/wd-body", "utf8");
      if (!body.includes(MARKER)) fails.push(`marker-missing: homepage lacks "${MARKER}"`);
    }
  } catch (e) {
    fails.push(`route-status ${r}: request failed (${String(e.message).slice(0, 80)})`);
  }
}

// 3. security headers on /
try {
  const hdrs = sh(`curl -sSI -L --max-time 25 '${URL_BASE}/'`).toLowerCase();
  for (const h of REQUIRED_HEADERS) {
    if (!hdrs.includes(`${h}:`)) fails.push(`header-missing: ${h}`);
  }
  note(`- headers checked: ${REQUIRED_HEADERS.join(", ")}`);
} catch (e) {
  fails.push(`headers: request failed (${String(e.message).slice(0, 80)})`);
}

// 4. cert expiry (openssl; -proxy when HTTPS_PROXY set)
try {
  const host = URL_BASE.replace(/^https?:\/\//, "").split("/")[0];
  const proxy = (process.env.HTTPS_PROXY || process.env.https_proxy || "")
    .replace(/^https?:\/\//, "").replace(/\/$/, "");
  const pflag = proxy ? `-proxy ${proxy}` : "";
  const end = sh(
    `echo | openssl s_client ${pflag} -servername ${host} -connect ${host}:443 2>/dev/null | openssl x509 -noout -enddate`,
  ).trim().replace("notAfter=", "");
  const days = Math.floor((new Date(end) - Date.now()) / 86_400_000);
  note(`- cert expires ${end} (${days} days)`);
  if (Number.isNaN(days)) warns.push("cert-expiry: could not parse date");
  else if (days < MIN_CERT_DAYS) fails.push(`cert-expiry: ${days} days left (< ${MIN_CERT_DAYS})`);
} catch {
  warns.push("cert-expiry: openssl check failed — verify manually");
}

// verdict + report
if (fails.length) note(`\nFAIL (${fails.length}):\n${fails.map((f) => `- ${f}`).join("\n")}`);
if (warns.length) note(`\nWARN (${warns.length}):\n${warns.map((w) => `- ${w}`).join("\n")}`);
note(fails.length ? "\nRESULT: FAIL" : "\nRESULT: pass");

const report = arg("--report", null);
if (report) fs.writeFileSync(report, lines.join("\n") + "\n");
process.exit(fails.length ? 1 : 0);
