/**
 * JOB APIS — optional sources that search far beyond the hand-made employer list, for any field.
 *
 * The employer boards in config/ cover a few dozen companies. On 2026-11-26 a finance run fetched
 * 2107 postings and kept 10, and a law run kept 0: most UK student roles in those fields are posted
 * on job sites, not on the four public ATS APIs. These sources ask job sites directly.
 *
 *   Adzuna   official API, free key     ADZUNA_APP_ID + ADZUNA_APP_KEY   used when both are set
 *   Reed     official API, free key     REED_API_KEY                      used when it is set
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

/** Every non-empty value of the named variables, and its Basic-auth form: never to be printed. */
const secretValues = (names, env) =>
  names
    .map((k) => String(env[k] ?? "").trim())
    .filter((v) => v.length >= 4)
    .flatMap((v) => [v, Buffer.from(`${v}:`).toString("base64")]);

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
  {
    // Docs, fetched 2026-11-26: https://www.reed.co.uk/developers/jobseeker — the search URL
    // https://www.reed.co.uk/api/{versionnumber}/search (version 1.0 in its own example), the
    // keywords, locationName and resultsToTake parameters ("defaults and is limited to 100
    // results"), and: "include your api key for all requests in a basic authentication http header
    // as the username, leaving the password empty". A made-up key measured HTTP 401. No rate limit
    // is published.
    //
    // The page lists each result's fields by display name only ("Job Id", "Employer Name", "Job
    // Title", "Description", "Location Name", ...) and shows no JSON. The keys read below are those
    // names in the camelCase the same page uses for its parameters (locationName, employerId). Nor
    // does it name the list's wrapper ("a list of jobs", plus alternative locations when a place is
    // ambiguous), so reedJobs takes the array whose items carry a job id or title, whatever it is
    // called. The search fields include no link; the Details answer has "Url to job on reed.co.uk".
    // So the link is the reed.co.uk URL the answer carries, and a result without one is looked up
    // (https://www.reed.co.uk/api/1.0/jobs/{Job Id}) only if discover's filter would keep it.
    name: "Reed",
    group: "Reed",
    env: ["REED_API_KEY"],
    notConfigured: "Reed: not configured — set REED_API_KEY (free key: www.reed.co.uk/developers/jobseeker)",
    rejected: [401, 403],
    timeoutMs: 25000,
    request: ({ role, location }, env) => {
      const qs = new URLSearchParams({ keywords: role, resultsToTake: "25" });
      if (location) qs.set("locationName", location);
      return { method: "GET", url: `https://www.reed.co.uk/api/1.0/search?${qs}`, headers: reedHeaders(env) };
    },
    parse: (d) =>
      reedJobs(d).map((j) => ({
        source: "reed",
        kind: "job",
        company: text(j.employerName),
        title: text(j.jobTitle),
        location: text(j.locationName),
        url: reedLink(j),
        posted: null, // the documented search fields hold no date
        description: snippet(j.jobDescription ?? j.description),
        _id: j.jobId == null ? null : String(j.jobId),
      })),
    lookup: {
      // Only a plain number goes into the path.
      request: (row, env) => (/^\d+$/.test(String(row._id ?? "")) ? { method: "GET", url: `https://www.reed.co.uk/api/1.0/jobs/${row._id}`, headers: reedHeaders(env) } : null),
      link: (d, row) => reedLink(d, row._id),
    },
  },
];

/** Basic auth with the key as the username and an empty password, as Reed's page says. */
function reedHeaders(env) {
  return { accept: "application/json", "user-agent": userAgent(), authorization: `Basic ${Buffer.from(`${env1(env, "REED_API_KEY")}:`).toString("base64")}` };
}

/** The jobs in a Reed search answer: the answer itself if it is a list, else its list of jobs. Pure. */
export function reedJobs(d) {
  const isJob = (x) => x && typeof x === "object" && ("jobId" in x || "jobTitle" in x);
  if (Array.isArray(d)) return d.filter(isJob);
  if (!d || typeof d !== "object") return [];
  const list = Object.values(d).find((v) => Array.isArray(v) && v.some(isJob));
  return list ? list.filter(isJob) : [];
}

/** The reed.co.uk link a Reed answer carries: the one naming the job's id first, else the first. Pure. */
export function reedLink(obj, id = obj?.jobId) {
  const links = Object.values(obj || {}).filter((v) => typeof v === "string" && /^https:\/\/(www\.)?reed\.co\.uk\//i.test(v));
  return (id != null && links.find((v) => v.includes(String(id)))) || links[0] || "";
}

/**
 * Run every configured source and return { rows, errors }. Prints one line per source as it goes.
 *
 *   env       where keys are read (process.env)
 *   fetchImpl the fetch to use (the self-test passes a stub, so no network is needed)
 *   known     normalised URLs already on this run's board: a row seen there is not added twice
 *   log       where progress lines go (console.error, like the rest of discover)
 *   keep      discover's job-board filter; only rows it keeps are worth a link lookup
 */
export async function fetchApiSources(profile, { env = process.env, fetchImpl = globalThis.fetch, log = console.error, known = new Set(), keep = (r) => r, pauseMs = 300, sources = API_SOURCES } = {}) {
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

    // One request: a refused key, any other non-2xx and a non-JSON answer each stop the source.
    const call = async (req) => {
      const r = await fetchWithTimeout(fetchImpl, req.url, { method: req.method, headers: req.headers, body: req.body }, s.timeoutMs);
      if (s.rejected.includes(r.status)) throw new Error(`key rejected (HTTP ${r.status})`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      try {
        return await r.json();
      } catch {
        throw new Error("the answer was not JSON");
      }
    };

    const byKey = new Map(); // de-duplicated within the source: by link, else by the source's own id
    let done = 0;
    let failure = null;
    for (const q of plan.queries) {
      if (done && pauseMs) await sleep(pauseMs);
      try {
        for (const row of s.parse(await call(s.request(q, env)))) {
          const k = row.url ? normalizeUrl(row.url) : `id:${row._id ?? row.title}`;
          if (!byKey.has(k)) byKey.set(k, row);
        }
        done++;
      } catch (e) {
        failure = e?.message || String(e);
        break;
      }
    }
    const found = [...byKey.values()];

    // A source whose search answer may carry no link looks one up — only for rows discover would
    // keep (keep() is discover's own filter), and at most MAX_QUERIES of them.
    let looked = 0;
    if (s.lookup && !failure) {
      for (const row of keep(found.filter((r) => !r.url)).slice(0, MAX_QUERIES)) {
        const req = s.lookup.request(row, env);
        if (!req) continue;
        if (pauseMs) await sleep(pauseMs);
        try {
          row.url = s.lookup.link(await call(req), row) || "";
          looked++;
        } catch (e) {
          failure = `${e?.message || e} (looking up a link)`;
          break;
        }
      }
    }

    // Scrubbed, de-duplicated against the board, internal fields dropped, and only rows discover can
    // use (a title and a link).
    let kept = 0;
    let linkless = 0;
    for (const raw of found) {
      const row = scrubRow(Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith("_"))), secrets);
      const id = normalizeUrl(row.url);
      if (row.title && !id) linkless++;
      if (!row.title || !id || seen.has(id)) continue;
      seen.add(id);
      rows.push(row);
      kept++;
    }
    const extra = `${looked ? `, ${looked} link(s) looked up` : ""}${linkless ? `, ${linkless} without a link skipped` : ""}`;
    if (failure) fail(failure, kept, done);
    else line(s.name, `${kept} postings${extra}`);
  }
  return { rows, errors };
}
