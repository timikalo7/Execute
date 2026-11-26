/**
 * PROFILE — the one place every script gets the user's profile and the values derived from it.
 *
 * Nothing about the person using this tool is hard-coded anywhere else. Intake season and year,
 * graduation year, target locations and countries, the offer to beat, the keywords that boost
 * ranking, the contact string sent to job boards — all of it is read from
 * `profile/master-profile.json` (or an environment variable with a neutral default) through the
 * helpers below.
 *
 * Self-tests never read your profile. Anything run with `--self-test` gets the FICTIONAL example
 * profile, so `npm test` passes on a clean clone with no personal data present, and a self-test can
 * never leak your data into its output.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_PROFILE = path.join("profile", "master-profile.json");
export const EXAMPLE_PROFILE = path.join(PROJECT_ROOT, "profile", "master-profile.example.json");

export const isSelfTest = () => process.argv.includes("--self-test");

/** Where the user's profile lives: CAREER_AGENT_PROFILE, else profile/master-profile.json under cwd. */
export function profilePath(root = process.cwd()) {
  return path.resolve(root, process.env.CAREER_AGENT_PROFILE || DEFAULT_PROFILE);
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export const loadExample = () => readJson(EXAMPLE_PROFILE);

/**
 * The user's profile, or a clear instruction when there is none. A missing profile is the first
 * thing a new user hits, so the message says exactly what to run rather than throwing ENOENT.
 */
export function loadProfile({ root = process.cwd(), exitOnMissing = true } = {}) {
  const p = profilePath(root);
  if (!fs.existsSync(p)) {
    if (!exitOnMissing) return null;
    console.error(
      `career-agent: no profile at ${path.relative(process.cwd(), p) || p}.\n` +
        `  Create it first:  npm run setup        (terminal quiz, no AI)\n` +
        `             or:    /career-onboard      (in Claude Code, reads your CV from profile/cv/)\n` +
        `  Then check it:    npm run profile:check`,
    );
    process.exit(2);
  }
  try {
    return readJson(p);
  } catch (e) {
    console.error(`career-agent: ${p} is not valid JSON — ${e.message}`);
    process.exit(2);
  }
}

let cached = null;
/** The profile this run should use: the example under --self-test, the user's otherwise. */
export function activeProfile() {
  if (!cached) cached = isSelfTest() ? loadExample() : loadProfile();
  return cached;
}

// ------------------------------------------------------------------ derived values

export const university = (p) => (p?.education || [])[0] || {};

/** The intake being applied for, e.g. { season: "summer", year: 2030 }. */
export function intake(p) {
  const t = p?.target?.timing || {};
  const year = Number(t.intake_year) || null;
  return { season: String(t.intake_season || "").trim().toLowerCase(), year };
}

/** "Summer 2030", or whatever part of it the profile states. */
export function intakeLabel(p) {
  const { season, year } = intake(p);
  const s = season ? season[0].toUpperCase() + season.slice(1) : "";
  return [s, year].filter(Boolean).join(" ");
}

export function graduationYear(p) {
  const u = university(p);
  return Number(u.graduation_year) || Number(String(u.end || "").slice(0, 4)) || null;
}

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A case-insensitive whole-word regex for a list of place names, or null for an empty list. */
export function termsRegex(terms) {
  const list = (terms || []).map((t) => String(t).trim()).filter(Boolean);
  return list.length ? new RegExp(`\\b(${list.map(esc).join("|")})\\b`, "i") : null;
}

export const targetLocations = (p) => p?.target?.locations || [];
export const targetCountries = (p) => p?.target?.countries || [];
export const remoteOk = (p) => p?.target?.remote_ok !== false;
export const homeCities = (p) => p?.target?.bar?.home_cities || [];
export const boostKeywords = (p) => p?.target?.boost_keywords || [];

/** Every place a posting can be in and still count as in range: target cities plus countries. */
export const placeRegex = (p) => termsRegex([...targetLocations(p), ...targetCountries(p)]);
export const homeRegex = (p) => termsRegex(homeCities(p));
export const REMOTE_RE = /\b(remote|online|virtual|worldwide|anywhere)\b/i;

/** Is this location string somewhere the profile says the user can work? */
export function inRange(location, p) {
  const loc = String(location || "");
  if (!loc) return false;
  const re = placeRegex(p);
  if (re && re.test(loc)) return true;
  return remoteOk(p) && REMOTE_RE.test(loc);
}

// A sector that names tech. "IT" must be a whole word, so "Audit" is not read as IT.
const TECH_SECTOR_RE = /tech|software|computing|computer|data|engineering|\bIT\b/i;

/** True for a tech profile: no target.sector, or one that names tech. discover keeps TECH_RE for it. */
export function isTechSector(p) {
  const sector = String(p?.target?.sector || "").trim();
  return !sector || TECH_SECTOR_RE.test(sector);
}

export const SOURCES_EXAMPLE = path.join(PROJECT_ROOT, "config", "sources.example.json");
export const SOURCES_GENERAL_EXAMPLE = path.join(PROJECT_ROOT, "config", "sources.general.example.json");

/**
 * The employer list discover reads: your jobs/sources.json when it exists; until then the shipped
 * example for your sector — tech employers for a tech profile, a multi-sector list for any other.
 */
export function sourcesFileFor(p, { root = process.cwd(), exists = fs.existsSync } = {}) {
  const own = path.join(root, "jobs", "sources.json");
  if (exists(own)) return own;
  return isTechSector(p) ? SOURCES_EXAMPLE : SOURCES_GENERAL_EXAMPLE;
}

/** The offer already held, or null. */
export function offerToBeat(p) {
  const o = p?.target?.bar_to_beat;
  return o && typeof o === "object" && o.employer ? o : null;
}

/** What the bar is called on screen: the offer's employer, or a neutral label when there is none. */
export const barLabel = (p) => (offerToBeat(p) ? `your ${offerToBeat(p).employer} offer` : "your bar");

/** Everything bar.mjs needs, in one object. */
export const barConfig = (p) => ({ ...(p?.target?.bar || {}), offer: offerToBeat(p) });

// ------------------------------------------------------------------ environment

/**
 * The User-Agent sent to public job-board APIs. Saying who is asking is good manners, but an email
 * address is personal data, so it is only sent when the user opts in with CAREER_AGENT_CONTACT.
 */
export function userAgent() {
  const contact = String(process.env.CAREER_AGENT_CONTACT || "").trim();
  return contact ? `career-agent/0.1 (personal job search; contact ${contact})` : "career-agent (personal job search)";
}

/** The contact for the HTTP `From:` header, only when the user supplied an email address. */
export function fromHeader() {
  const contact = String(process.env.CAREER_AGENT_CONTACT || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? { from: contact } : {};
}

/** Launch options for Playwright's bundled Chromium, honouring CAREER_AGENT_CHROMIUM. */
export function chromiumOptions(extra = {}) {
  const exe = String(process.env.CAREER_AGENT_CHROMIUM || "").trim();
  return exe ? { ...extra, executablePath: exe } : extra;
}

// ------------------------------------------------------------------ which browser to launch
//
// Playwright's own Chromium is a 150 MB download, and on a workshop's Wi-Fi that one step is where a
// room of laptops stalls. Almost every laptop already has a browser Playwright can drive: Windows
// ships Microsoft Edge, and most Macs and Linux machines have Google Chrome. So the installed browser
// is tried first, and the download is a fallback rather than a setup step.

/** The values CAREER_AGENT_BROWSER accepts. "chromium" means Playwright's own build only. */
export const BROWSER_NAMES = ["msedge", "chrome", "chromium"];

const BROWSER_SETUP = "CAREER_AGENT_BROWSER_SETUP";
const setupError = (message) => Object.assign(new Error(message), { code: BROWSER_SETUP });

/** What to do when no browser starts. Both fixes, in one sentence. */
export const NO_BROWSER_HELP = "Install Microsoft Edge or Google Chrome, or run once: npx playwright install chromium";

/**
 * Every browser to try, in order. Pure: the same platform and env always give the same list.
 *
 *   1. CAREER_AGENT_CHROMIUM — an executable path the user named.
 *   2. CAREER_AGENT_BROWSER  — msedge, chrome or chromium. "chromium" skips the installed browsers.
 *   3. The platform default  — win32: msedge, chrome · darwin: chrome, msedge · linux: chrome.
 *   4. Playwright's bundled Chromium, always last.
 *
 * Each entry is { label, options }; options are what it adds to the Playwright launch options.
 */
export function browserCandidates(platform = process.platform, env = process.env) {
  const list = [];
  const add = (c) => {
    if (!list.some((x) => x.label === c.label)) list.push(c);
  };
  const installed = (channel) => ({ label: `${channel} (installed)`, options: { channel } });
  const bundled = { label: "bundled chromium", options: {} };

  const exe = String(env.CAREER_AGENT_CHROMIUM || "").trim();
  if (exe) add({ label: `${exe} (CAREER_AGENT_CHROMIUM)`, options: { executablePath: exe } });

  const wanted = String(env.CAREER_AGENT_BROWSER || "").trim().toLowerCase();
  if (wanted && !BROWSER_NAMES.includes(wanted)) {
    throw setupError(
      `career-agent: CAREER_AGENT_BROWSER is ${JSON.stringify(env.CAREER_AGENT_BROWSER)} — use ${BROWSER_NAMES.join(", ")}, or leave it unset.`,
    );
  }
  if (wanted === "chromium") {
    add(bundled);
    return list;
  }
  if (wanted) add(installed(wanted));

  const defaults = { win32: ["msedge", "chrome"], darwin: ["chrome", "msedge"] }[platform] || ["chrome"];
  for (const channel of defaults) add(installed(channel));
  add(bundled);
  return list;
}

let announced = "";

/**
 * Launch the first browser in browserCandidates() that starts, and print which one in one line,
 * e.g. `browser: chrome (installed)`. `extra` is the usual Playwright launch options; the candidate
 * decides `channel` and `executablePath`. With `persistentDir` it returns a persistent context.
 * If nothing starts it throws one plain message naming both fixes — hand it to exitIfNoBrowser().
 */
export async function launchBrowser(extra = {}, { persistentDir = null, platform = process.platform, env = process.env } = {}) {
  const { chromium } = await import("playwright");
  const rest = { ...extra };
  delete rest.channel;
  delete rest.executablePath;
  const failed = [];
  for (const c of browserCandidates(platform, env)) {
    const options = { ...rest, ...c.options };
    try {
      const b = persistentDir
        ? await chromium.launchPersistentContext(persistentDir, options)
        : await chromium.launch(options);
      const line = `browser: ${c.label}${failed.length ? `, after ${failed.join(", ")} did not start` : ""}`;
      if (line !== announced) console.log((announced = line));
      return b;
    } catch {
      failed.push(c.label);
    }
  }
  throw setupError(`career-agent: no browser could be started (tried ${failed.join(", ")}). ${NO_BROWSER_HELP}`);
}

/** For `.catch()` after launchBrowser(): print a browser-setup message alone (no stack) and exit 3. */
export function exitIfNoBrowser(e) {
  if (e?.code !== BROWSER_SETUP) throw e;
  console.error(e.message);
  process.exit(3);
}

/** A port for a self-test server: CAREER_AGENT_TEST_PORT + offset if set, else 0 (the OS picks). */
export function testPort(offset = 0) {
  const base = Number(process.env.CAREER_AGENT_TEST_PORT || 0);
  return base ? base + offset : 0;
}

/** A free TCP port, or CAREER_AGENT_CDP_PORT when set. For the attach (CDP) self-test. */
export async function cdpPort() {
  const fixed = Number(process.env.CAREER_AGENT_CDP_PORT || 0);
  if (fixed) return fixed;
  const net = await import("node:net");
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/** Your own non-technical CV (optional): the PDF, and the text normal-cv.mjs extracts back out of it. */
export function normalCvPaths(p) {
  const clean = (s) => String(s || "").replace(/[^A-Za-z0-9 .]/g, " ").trim().replace(/\s+/g, "-");
  const pdf = p?.cv_files?.normal_pdf || path.join("profile", "cv", `${clean(p?.identity?.name) || "my"}-CV-Normal.pdf`);
  return { pdf, txt: pdf.replace(/\.pdf$/i, "") + ".txt" };
}
