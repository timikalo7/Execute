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

/**
 * curl, but the transport failure is reported SEPARATELY from the HTTP result.
 *
 * This is the whole fix for issue #29. The old code wrapped every curl in a try/catch and
 * pushed "request failed" into `fails`, so a runner that could not open a socket produced
 * six route FAILURES and a red issue claiming the church site was down — for three days,
 * while the site served 200s the entire time. A watchdog that cries wolf gets ignored,
 * which is worse than not having one.
 *
 * curl's exit codes carry the distinction the old code threw away:
 *   5 no proxy · 6 DNS · 7 connect refused · 28 timeout · 35 TLS handshake
 *   52 empty reply · 55 send failure · 56 recv failure / CONNECT tunnel failed
 * Those are TRANSPORT failures. Anything else with a status line is an HTTP answer.
 *
 * 56 was found by MEASUREMENT, not by reading the man page: behind this container's agent
 * proxy an unreachable host returns `curl: (56) CONNECT tunnel failed, response 502`, and
 * the first version of this fix omitted it — so the "no network at all" test still
 * reported FAIL. A transport-code list assembled from memory is a list with holes in it.
 *
 * The IPv4/IPv6 retry matters for any IPv6-only site (the case that found this resolved to an
 * IPv6 address only), and GitHub's hosted runners have historically had no IPv6 route.
 */
const TRANSPORT_CODES = new Set([5, 6, 7, 28, 35, 52, 55, 56]);

function curlStatus(url, { extraArgs = "" } = {}) {
  for (const family of ["", "-4", "-6"]) {
    try {
      const out = execSync(
        `curl -sS ${family} ${extraArgs} -o /tmp/wd-body -w '%{http_code} %{time_total}' -L --max-time 25 '${url}'`,
        { encoding: "utf8", timeout: 30_000 },
      );
      const [code, secs] = out.trim().split(" ");
      return { ok: true, code, ms: Math.round(parseFloat(secs) * 1000), family: family || "auto" };
    } catch (e) {
      const status = typeof e.status === "number" ? e.status : null;
      // Not a transport problem — curl reached something and disliked the answer. Stop
      // retrying families; the next one will fail identically.
      if (status !== null && !TRANSPORT_CODES.has(status)) {
        return { ok: false, transport: false, status, message: String(e.message).slice(0, 120) };
      }
      // Transport failure on this family — fall through and try the next one.
    }
  }
  return { ok: false, transport: true, message: "no IP family could open a connection" };
}

/**
 * Can this machine reach the internet at all? Without this, "the site is down" and "the
 * runner has no route" are the same observation, and the old watchdog reported the second
 * as the first. If the control host answers and the target does not, the target really is
 * down. If neither answers, the WATCHDOG is broken, not the site.
 */
const CONTROL = cfg.controlUrl || "https://example.com/";
function reachable() {
  const r = curlStatus(CONTROL);
  return r.ok && String(r.code).startsWith("2");
}

const fails = [];
const unreachable = [];
const warns = [];
const lines = [];
const note = (s) => { lines.push(s); console.log(s); };

note(`# watchdog — ${URL_BASE} — ${new Date().toISOString()}`);

// 1+2. routes: status, latency, homepage marker
for (const r of ROUTES) {
  const url = URL_BASE + r;
  const res = curlStatus(url);
  try {
    if (!res.ok) {
      // Transport failures are collected apart from FAILs and resolved after the control
      // check below — they may mean the site is down, or that we cannot reach anything.
      (res.transport ? unreachable : fails).push(
        res.transport ? `route ${r}: ${res.message}` : `route-status ${r}: ${res.message}`,
      );
      continue;
    }
    const { code, ms } = res;
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
  let hdrs = "";
  let got = false;
  for (const family of ["", "-4", "-6"]) {
    try { hdrs = sh(`curl -sSI ${family} -L --max-time 25 '${URL_BASE}/'`).toLowerCase(); got = true; break; }
    catch { /* try the next IP family before calling this a failure */ }
  }
  if (!got) unreachable.push("headers: could not open a connection on any IP family");
  else {
    for (const h of REQUIRED_HEADERS) {
      if (!hdrs.includes(`${h}:`)) fails.push(`header-missing: ${h}`);
    }
    note(`- headers checked: ${REQUIRED_HEADERS.join(", ")}`);
  }
} catch (e) {
  unreachable.push(`headers: ${String(e.message).slice(0, 80)}`);
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
/**
 * Resolve the transport failures. This is the decision the old version never made:
 *   control reachable + target not  → the SITE is down. A real FAIL.
 *   control unreachable too         → the WATCHDOG cannot see the internet. NOT-CHECKED.
 *
 * NOT-CHECKED exits 3, deliberately distinct from both pass (0) and fail (1), so the
 * workflow can raise it as a broken-monitor problem instead of a red site alert.
 * CLAUDE.md: a skipped check is reported as not-checked, never as done — and equally
 * never as a failure of the thing it could not look at.
 */
let notChecked = false;
if (unreachable.length) {
  const controlOk = reachable();
  if (controlOk) {
    fails.push(...unreachable.map((u) => `${u} — and the control host WAS reachable, so this is the site`));
  } else {
    notChecked = true;
    note(`\nNOT CHECKED (${unreachable.length}): this machine could not reach ${CONTROL} either.`);
    note(`  The site was NOT tested. This is a watchdog/runner problem, not a site problem.`);
    note(`  Most likely: no route to the target's IP family (this site is IPv6-only) or egress is blocked.`);
    for (const u of unreachable) note(`  - ${u}`);
  }
}

if (fails.length) note(`\nFAIL (${fails.length}):\n${fails.map((f) => `- ${f}`).join("\n")}`);
if (warns.length) note(`\nWARN (${warns.length}):\n${warns.map((w) => `- ${w}`).join("\n")}`);
note(fails.length ? "\nRESULT: FAIL" : notChecked ? "\nRESULT: NOT CHECKED" : "\nRESULT: pass");

const report = arg("--report", null);
if (report) fs.writeFileSync(report, lines.join("\n") + "\n");
process.exit(fails.length ? 1 : notChecked ? 3 : 0);
