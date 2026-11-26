/**
 * JOB APIS — optional sources that search far beyond the hand-made employer list, for any field.
 *
 * The employer boards in config/ cover a few dozen companies. On 2026-11-26 a finance run fetched
 * 2107 postings and kept 10, and a law run kept 0: most UK student roles in those fields are posted
 * on job sites, not on the four public ATS APIs. These sources ask job sites directly.
 *
 *   Adzuna   official API, free key     ADZUNA_APP_ID + ADZUNA_APP_KEY   used when both are set
 *
 * With no key a source prints one "not configured" line and makes NO network call. That is not a
 * failure: the tool works exactly as before. A key the service refuses is a FAILED source.
 *
 * Every row goes back to discover.mjs, which puts it through the SAME chain as a job-board row
 * (INTERN_RE, field words, exclusions, location) and then the normal eligibility rules. Nothing
 * here decides what is an internship; it only searches and maps the answer to discover's row shape.
 *
 * SECRETS. Keys are read from process.env only (the env argument defaults to it). They are never
 * printed and never stored: every error message and every row is scrubbed of them, and a request
 * URL is only ever shown through redactUrl(), which drops the query string. Every request has a
 * timeout that is proven to fire (an owned timer, not AbortSignal.timeout, which is unref'd and can
 * let the process exit with the request still pending).
 *
 * RATE. At most MAX_QUERIES requests per source per run (target.roles × target.locations), one at a
 * time, with a pause between them. No retries: a refused or failing call stops that source for the
 * run, keeps what it had found, and reports it.
 */

import { normalizeUrl } from "./decisions.mjs";
import { userAgent } from "./profile.mjs";

export const MAX_QUERIES = 10;
const MAX_TERM = 100; // longest role or place sent to an API, in characters
const SNIPPET = 500; // longest description kept from a result, in characters

/** The searches for one source: target.roles × target.locations, capped at MAX_QUERIES. Pure. */
export function apiQueries(profile, max = MAX_QUERIES) {
  const clean = (xs) => [
    ...new Set((Array.isArray(xs) ? xs : []).map((x) => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TERM)).filter(Boolean)),
  ];
  const roles = clean(profile?.target?.roles);
  const places = clean(profile?.target?.locations);
  const all = roles.flatMap((role) => (places.length ? places : [""]).map((location) => ({ role, location })));
  return { queries: all.slice(0, max), total: all.length, roles: roles.length, places: places.length };
}

/** A URL safe to print: the query string (where Adzuna's keys travel) is dropped. Pure. */
export const redactUrl = (url) => {
  const s = String(url || "");
  const i = s.indexOf("?");
  return i < 0 ? s : `${s.slice(0, i)}?[query redacted]`;
};

/** Every non-empty value of the named variables: the strings that must never be printed. */
const secretValues = (names, env) => names.map((k) => String(env[k] ?? "").trim()).filter((v) => v.length >= 4);

/** `text` with every secret replaced. Used on every error message and every row. Pure. */
export function scrub(text, secrets) {
  let s = String(text ?? "");
  for (const v of secrets) s = s.split(v).join("[redacted]");
  return s;
}

const scrubRow = (row, secrets) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === "string" ? scrub(v, secrets) : v]));

const text = (v) => String(v ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const snippet = (v) => {
  const s = text(v);
  return s ? s.slice(0, SNIPPET) : null;
};

/**
 * fetch with a timeout that fires. An owned AbortController and timer, cleared in `finally` — the
 * gate-protections fetchSafe pattern. Throws "timed out after Ns" when it fires.
 */
export async function fetchWithTimeout(fetchImpl, url, init, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetchImpl(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error(`timed out after ${Math.round(ms / 1000)}s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env1 = (env, k) => String(env[k] ?? "").trim();

/**
 * The sources. Each one says which variables it needs, where the free key comes from, how one
 * search becomes one request, and how the documented answer becomes discover's rows.
 *
 *   request(query, env) -> { method, url, headers, body? }
 *   parse(body)         -> [{ source, kind, company, title, location, url, posted, description }]
 *   rejected            -> HTTP statuses that mean "this key is refused"
 */
export const API_SOURCES = [
  {
    // Docs, fetched 2026-11-26: https://developer.adzuna.com/overview (keys as the app_id and app_key
    // query parameters, root https://api.adzuna.com/v1/api), https://developer.adzuna.com/docs/search
    // (the /jobs/gb/search/1 example), and the API's own OpenAPI file behind
    // https://developer.adzuna.com/activedocs (/swagger/spec/test2.json): every parameter used below,
    // the Job fields read below, and 410 "Authorisation failed". A made-up key measured HTTP 401.
    // Limits: no number is published; "The plans available to you, and their limits, are shown in
    // your account" (https://developer.adzuna.com/docs/terms_of_service, which also allows personal
    // job search). description is "truncated to 500 characters" by Adzuna itself.
    name: "Adzuna",
    group: "Adzuna",
    env: ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"],
    notConfigured: "Adzuna: not configured — set ADZUNA_APP_ID and ADZUNA_APP_KEY (free key: developer.adzuna.com/signup)",
    rejected: [401, 403, 410],
    timeoutMs: 25000,
    request: ({ role, location }, env) => {
      const qs = new URLSearchParams({
        app_id: env1(env, "ADZUNA_APP_ID"),
        app_key: env1(env, "ADZUNA_APP_KEY"),
        results_per_page: "20",
        what: role,
        "content-type": "application/json",
      });
      if (location) qs.set("where", location);
      return {
        method: "GET",
        url: `https://api.adzuna.com/v1/api/jobs/gb/search/1?${qs}`,
        headers: { accept: "application/json", "user-agent": userAgent() },
      };
    },
    parse: (d) =>
      (Array.isArray(d?.results) ? d.results : []).map((j) => ({
        source: "adzuna",
        kind: "job",
        company: text(j?.company?.display_name),
        title: text(j?.title),
        location: text(j?.location?.display_name) || (Array.isArray(j?.location?.area) ? j.location.area.join(", ") : ""),
        url: String(j?.redirect_url || ""),
        posted: j?.created || null,
        description: snippet(j?.description),
      })),
  },
];

/**
 * Run every configured source and return { rows, errors }. Prints one line per source as it goes.
 *
 *   env       where keys are read (process.env)
 *   fetchImpl the fetch to use (the self-test passes a stub, so no network is needed)
 *   known     normalised URLs already on this run's board: a row seen there is not added twice
 *   log       where progress lines go (console.error, like the rest of discover)
 */
export async function fetchApiSources(profile, { env = process.env, fetchImpl = globalThis.fetch, log = console.error, known = new Set(), pauseMs = 300, sources = API_SOURCES } = {}) {
  const rows = [];
  const errors = [];
  const seen = new Set(known);
  const notConfiguredSaid = new Set();
  const warned = new Set();
  const plan = apiQueries(profile);
  const line = (name, msg) => log(`  ${name.padEnd(18)} ${"api".padEnd(11)} ${msg}`);

  for (const s of sources) {
    // No key, no call: one plain line, and on to the next source. Not a failure.
    if (!s.env.every((k) => env1(env, k))) {
      if (!notConfiguredSaid.has(s.group)) log(`  ${s.notConfigured}`);
      notConfiguredSaid.add(s.group);
      continue;
    }
    const secrets = secretValues(s.env, env);
    if (s.warning && !warned.has(s.group)) log(`  ${s.warning}`);
    warned.add(s.group);
    const fail = (msg, kept = 0, done = 0) => {
      const clean = scrub(msg, secrets);
      errors.push(`${s.name}: ${clean}`);
      line(s.name, `FAILED — ${clean}${done ? ` after ${done} of ${plan.queries.length} queries (${kept} postings kept)` : ""}`);
    };
    if (s.check) {
      const problem = s.check(env);
      if (problem) {
        fail(problem);
        continue;
      }
    }
    if (!plan.queries.length) {
      line(s.name, "no target.roles in your profile — nothing to search");
      continue;
    }
    line(
      s.name,
      `${plan.queries.length} quer${plan.queries.length === 1 ? "y" : "ies"} (${plan.roles} role(s) × ${plan.places || "no"} location(s)` +
        `${plan.total > plan.queries.length ? `: ${plan.total}, capped at ${MAX_QUERIES}` : ""})`,
    );

    const found = [];
    let done = 0;
    let failure = null;
    for (const q of plan.queries) {
      if (done && pauseMs) await sleep(pauseMs);
      let r;
      try {
        const req = s.request(q, env);
        r = await fetchWithTimeout(fetchImpl, req.url, { method: req.method, headers: req.headers, body: req.body }, s.timeoutMs);
      } catch (e) {
        failure = e?.message || String(e);
        break;
      }
      if (s.rejected.includes(r.status)) {
        failure = `key rejected (HTTP ${r.status})`;
        break;
      }
      if (!r.ok) {
        failure = `HTTP ${r.status}`;
        break;
      }
      let body;
      try {
        body = await r.json();
      } catch {
        failure = "the answer was not JSON";
        break;
      }
      found.push(...s.parse(body));
      done++;
    }

    // Scrubbed, de-duplicated, and only rows discover can use (a title and a link).
    let kept = 0;
    for (const raw of found) {
      const row = scrubRow(raw, secrets);
      const id = normalizeUrl(row.url);
      if (!row.title || !id || seen.has(id)) continue;
      seen.add(id);
      rows.push(row);
      kept++;
    }
    if (failure) fail(failure, kept, done);
    else line(s.name, `${kept} postings`);
  }
  return { rows, errors };
}
