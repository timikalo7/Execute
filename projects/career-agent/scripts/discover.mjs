#!/usr/bin/env node
/**
 * DISCOVERY — find internships daily, without scraping anything that does not want to be scraped.
 *
 * Two tiers, deliberately:
 *
 *   TIER 1 — public ATS JSON. Greenhouse, Lever and Ashby all publish job boards as documented
 *            public JSON endpoints. No scraping, no HTML parsing, no bot detection, no breakage when
 *            someone changes a CSS class. This is the backbone and it should stay the backbone.
 *            Measured working: greenhouse/monzo 77 jobs, lever/palantir 305, ashby/ramp 122.
 *
 *   TIER 2 — aggregator sites (gradcracker, the-trackr, ther3cruit, company career portals). These
 *            need a real browser and careful manners, and they are handled by a separate CI job,
 *            NOT here. Recorded honestly in sources.json with what each one actually does:
 *              the-trackr    serves a JS shell — 13.5KB of HTML with zero job words
 *              gradcracker   403s a declared automated agent, though robots.txt allows the path
 *              ther3cruit    sits behind a captcha layer (robots.txt itself returns a challenge)
 *              blackrock     robots.txt disallows /search-jobs/ — so that path is off-limits
 *
 *   JOB APIS — scripts/sources-api.mjs. Adzuna and Reed (official APIs, free keys) search the whole
 *            job market when their keys are set. Apify's LinkedIn and Indeed scrapers run ONLY when
 *            APIFY_TOKEN is set — those sites' terms forbid scraping, so it is the user's opt-in, and
 *            each run says so. With no keys: one "not configured" line each, no network call. Their
 *            rows go through the same job-board filter (matchJobs) as every other posting.
 *
 * Filtering is intentionally strict. The job of this tool is NOT to produce volume — it is to surface
 * the handful of roles worth your evening, and (if you already hold an offer) worth declining it for.
 *
 * Everything personal comes from your profile: target.locations / target.countries decide what is in
 * range, target.timing.intake_year picks the right internship lists, target.boost_keywords and
 * target.bar.home_cities shape the score. The contact string sent to the job boards is
 * CAREER_AGENT_CONTACT (default: a neutral "career-agent (personal job search)").
 *
 * The list of employer boards is jobs/sources.json — your own copy, gitignored. Until you make one,
 * config/sources.example.json is used for a tech profile and config/sources.general.example.json
 * (many sectors) for any other. Add rows by hand or with `node scripts/probe-sources.mjs`.
 *
 * Usage:
 *   node scripts/discover.mjs               # fetch, filter, merge into jobs/found.json
 *   node scripts/discover.mjs --new         # print only what appeared since the last run
 *   node scripts/discover.mjs --dry         # fetch and report, write nothing
 */

import fs from "node:fs";
import path from "node:path";
import { assess } from "./eligibility.mjs";
import { rank } from "./bar.mjs";
import { decisions, isDecided, normalizeUrl } from "./decisions.mjs";
import { API_SOURCES, apiQueries, fetchApiSources, fetchWithTimeout, MAX_QUERIES, redactUrl, reedLink, scrub } from "./sources-api.mjs";
import { barConfig, boostKeywords, fromHeader, homeRegex, inRange, intake, intakeLabel, isTechSector, loadExample, loadProfile, PROJECT_ROOT, SOURCES_EXAMPLE, SOURCES_GENERAL_EXAMPLE, sourcesFileFor, targetCountries, TECH_RE, termsRegex, userAgent } from "./profile.mjs";

const ROOT = process.cwd();
const SOURCES = path.join(ROOT, "jobs", "sources.json");
const FOUND = path.join(ROOT, "jobs", "found.json");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const ONLY_NEW = args.includes("--new");

// ---------------------------------------------------------------- matching rules
// An "internship" here means a summer/industrial placement for a student, in YOUR field, somewhere
// your profile says you can work. Each rule is separate so a miss can be diagnosed rather than
// guessed at. The field comes from the profile (fieldWords below); TECH_RE is the default.
// "insight" counts only as a student programme: "Insight Week", "Insight Programme", "Spring Insight".
// A bare "insight" kept full-time roles such as "Lead Insight Analyst" on a marketing student's board.
const INTERN_RE = /\b(intern|internship|placement|industrial year|summer analyst|work experience|insight\s+(?:days?|weeks?|programme|program|event|evening|series|scheme)|spring\s+insight|spring week|graduate scheme)\b/i;
// TECH_RE lives in profile.mjs: isTechSector reads it too (an empty sector with only non-tech roles).
// Excludes things that match "intern" but are not internships.
const EXCLUDE_RE = /\b(internal|international(?! )|internship program manager|recruiter|sales|marketing intern|hr intern)\b/i;
// The same terms as EXCLUDE_RE, each with the field word(s) that switch it off for a profile whose
// own field it is: a marketing student must see "Marketing Intern". The self-test proves this list
// and EXCLUDE_RE agree, so the tech default keeps exactly the regex above.
const EXCLUDE_TERMS = [
  ["internal", ["internal"]],
  ["international(?! )", ["international"]],
  ["internship program manager", []], // a recruiting job, never a field
  ["recruiter", ["recruiter"]],
  ["sales", ["sales"]],
  ["marketing intern", ["marketing"]],
  ["hr intern", ["hr", "human resources"]],
];

// ---------------------------------------------------------------- the attendee's field
// Words in target.roles that say what KIND of role it is, not which field. Never field words.
const GENERIC_WORDS = new Set(
  "intern internship placement summer graduate programme program scheme analyst associate year role roles and the for with in of".split(" "),
);
// Broad words that name no field on their own. With "digital marketing" as a boost keyword, a bare
// "digital" put quant, cyber and software-apprenticeship titles on a marketing student's board.
// A weak word never counts by itself; a role or boost keyword made ONLY of weak words counts as one
// phrase ("Social media intern" gives "social media"). target.title_keywords is never filtered.
const WEAK_WORDS = new Set(
  "digital media social global business data technology tech solutions operations analytics research strategy management product products assets innovation services customer insights".split(" "),
);

/**
 * The words a job-board title must contain to count as the attendee's field. Pure.
 *
 *   1. target.title_keywords, when it is a non-empty list: exactly those, as whole words.
 *   2. Else a missing or tech sector: TECH_RE, unchanged ({ from: "tech", words: null }).
 *   3. Else the words of target.roles plus target.boost_keywords, lower-cased, without words of three
 *      letters or fewer and without GENERIC_WORDS. One exception to the length rule: a short word the
 *      profile writes in capitals is an acronym (HR, PR, UX), so it is kept. Numbers are not words.
 *      Per role or keyword, WEAK_WORDS are left out when another word is left ("digital marketing"
 *      gives "marketing"); when only weak words are left, they count as one phrase ("social media").
 */
export function fieldWords(profile) {
  const t = profile?.target || {};
  const own = (Array.isArray(t.title_keywords) ? t.title_keywords : []).map((k) => String(k).trim()).filter(Boolean);
  if (own.length) return { from: "title_keywords", words: [...new Set(own.map((k) => k.toLowerCase()))] };
  if (isTechSector(profile)) return { from: "tech", words: null };
  const words = [];
  const add = (w) => words.includes(w) || words.push(w);
  for (const phrase of [].concat(t.roles || [], t.boost_keywords || [])) {
    const left = [];
    for (const w of String(phrase).split(/[^\p{L}\p{N}]+/u)) {
      const lw = w.toLowerCase();
      if (!/\p{L}/u.test(w) || GENERIC_WORDS.has(lw)) continue;
      const acronym = w.length >= 2 && w === w.toUpperCase();
      if (lw.length <= 3 && !acronym) continue;
      left.push(lw);
    }
    const strong = left.filter((w) => !WEAK_WORDS.has(w));
    if (strong.length) strong.forEach(add);
    else if (left.length) add(left.join(" "));
  }
  return { from: "roles", words };
}

/** fieldWords as a whole-word, case-insensitive regex. A tech profile gets TECH_RE itself. */
export function fieldWordsRe(profile) {
  const f = fieldWords(profile);
  if (f.from === "tech") return TECH_RE;
  // No usable word (e.g. roles "Law intern": "law" is three letters): keep every internship rather
  // than show an empty board. main() prints how to narrow it with target.title_keywords.
  return termsRegex(f.words) || /(?:)/;
}

/** EXCLUDE_RE without the terms that name the profile's own field. A tech profile gets EXCLUDE_RE. */
export function excludeRe(profile) {
  const { words } = fieldWords(profile);
  if (!words) return EXCLUDE_RE;
  const has = (k) => words.includes(k) || (k.includes(" ") && k.split(" ").every((w) => words.includes(w)));
  const kept = EXCLUDE_TERMS.filter(([, keys]) => !keys.some(has)).map(([term]) => term);
  if (kept.length === EXCLUDE_TERMS.length) return EXCLUDE_RE;
  return new RegExp(`\\b(${kept.join("|")})\\b`, "i");
}

// Core computer-science titles and apprenticeships. A title can name a non-tech field and still be
// one of these ("Global Markets Intern - Markets Engineering", "Marketing Apprentice"), so a profile
// with its own field words leaves them out unless the profile asks for them. Tech profiles: unchanged.
// "quant" and "quantitative" are not here: quant research internships are finance roles.
const CS_CORE_RE = /\b(software|developers?|engineer|engineering|machine learning|cyber|devops|full[- ]?stack|back[- ]?end|front[- ]?end|programmer|programming)\b/i;
const APPRENTICE_RE = /\bapprentice(ship)?s?\b/i;

/**
 * What a profile with its own field words leaves out even when the title names the field. Pure.
 * null for a tech profile (nothing more is left out). Otherwise { csOk, apprenticeOk, drops(title, kind) }:
 *   - a CS_CORE_RE title is dropped unless one of the profile's own field words matches CS_CORE_RE;
 *   - an APPRENTICE_RE title is dropped unless target.roles or target.title_keywords say "apprentice".
 *     Not for a row of kind "event": "Insight into Finance Apprenticeships" is an insight event.
 * Callers keep hand-added jobs/manual.json rows whatever this says.
 */
export function fieldNarrow(profile) {
  const { words } = fieldWords(profile);
  if (!words) return null;
  const t = profile?.target || {};
  const asked = [].concat(Array.isArray(t.roles) ? t.roles : [], Array.isArray(t.title_keywords) ? t.title_keywords : []);
  const csOk = words.some((w) => CS_CORE_RE.test(w));
  const apprenticeOk = asked.some((r) => /apprentice/i.test(String(r)));
  return { csOk, apprenticeOk, drops: (title, kind) => (!csOk && CS_CORE_RE.test(title)) || (!apprenticeOk && kind !== "event" && APPRENTICE_RE.test(title)) };
}

/**
 * The same field rule for what the opportunity sources find (job lists, hackathons, events): for a
 * profile with its own field words, a row must name the field in its title and not be one fieldNarrow
 * drops. Rows you add yourself in jobs/manual.json always stay. A tech profile gets the very same
 * array back. Pure.
 */
export function fieldOpportunities(rows, profile) {
  if (!fieldWords(profile).words) return rows;
  const field = fieldWordsRe(profile);
  const { drops } = fieldNarrow(profile);
  return rows.filter((o) => o.source === "manual" || (field.test(String(o.title || "")) && !drops(String(o.title || ""), o.kind)));
}

/**
 * THE BOARD BELONGS TO ONE FIELD. discover merges into jobs/found.json, so rows kept under an earlier
 * field rule stayed on the board after the profile changed: a finance attendee who first ran the
 * example profile still saw its CS rows. found.json records this fingerprint of the field filter
 * (tech or not, plus the field-words regex, plus fieldNarrow's two switches for a non-tech profile),
 * and a different one clears the stored rows. Pure.
 */
export function fieldFingerprint(profile) {
  const base = `${isTechSector(profile) ? "tech" : "non-tech"}|${fieldWordsRe(profile).source}`;
  const narrow = fieldNarrow(profile);
  return narrow ? `${base}|cs:${narrow.csOk ? "kept" : "dropped"}|apprentice:${narrow.apprenticeOk ? "kept" : "dropped"}` : base;
}

// A board written before fingerprints existed counts as the tech default, which was the only filter
// for most of this tool's life: a tech board keeps today's merge, any other field starts clean.
export const LEGACY_FINGERPRINT = fieldFingerprint({});

/** The stored rows discover may merge into: all of them for the same field, none after a change. Pure. */
export function boardForField(stored, fingerprint) {
  const jobs = Array.isArray(stored?.jobs) ? stored.jobs : [];
  if ((stored?.field_fingerprint ?? LEGACY_FINGERPRINT) === fingerprint) return { jobs, cleared: false };
  return { jobs: [], cleared: jobs.length > 0 };
}

// Law firms call their summer internship a "vacation scheme". Accepted for a profile with its own
// field words only, so a tech profile keeps INTERN_RE exactly.
const FIELD_INTERN_RE = /\b(vacation scheme)\b/i;

/**
 * The job-board filter main() applies: an internship, not excluded, in the field, not one fieldNarrow
 * drops (non-tech only; a manual row is never dropped by it), in range. Pure.
 */
export function matchJobs(all, profile) {
  const field = fieldWordsRe(profile);
  const exclude = excludeRe(profile);
  const narrow = fieldNarrow(profile);
  const intern = fieldWords(profile).words ? (t) => INTERN_RE.test(t) || FIELD_INTERN_RE.test(t) : (t) => INTERN_RE.test(t);
  return all
    .filter((j) => intern(j.title) && !exclude.test(j.title))
    .filter((j) => field.test(j.title))
    .filter((j) => !narrow || j.source === "manual" || !narrow.drops(j.title, j.kind))
    .filter((j) => inRange(j.location, profile) || inRange(j.title, profile));
}

const fetchJSON = async (url) => {
  const r = await fetch(url, {
    headers: { "user-agent": userAgent() },
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

/** Each ATS returns a different shape; normalise to one record so everything downstream is uniform. */
const ADAPTERS = {
  greenhouse: {
    url: (slug) => `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
    parse: (d, co) =>
      (d.jobs || []).map((j) => ({
        source: "greenhouse",
        company: co,
        title: j.title,
        location: j.location?.name || "",
        url: j.absolute_url,
        posted: j.updated_at || null,
      })),
  },
  lever: {
    url: (slug) => `https://api.lever.co/v0/postings/${slug}?mode=json`,
    parse: (d, co) =>
      (Array.isArray(d) ? d : []).map((j) => ({
        source: "lever",
        company: co,
        title: j.text,
        location: j.categories?.location || "",
        url: j.hostedUrl,
        posted: j.createdAt ? new Date(j.createdAt).toISOString() : null,
      })),
  },
  // SmartRecruiters publishes a documented public postings API. Several UK employers have no
  // Greenhouse or Lever board at all and only appear here, so leaving it out was invisible coverage
  // loss rather than a missing nice-to-have.
  smartrecruiters: {
    url: (slug) => `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`,
    parse: (d, co) =>
      (d.content || []).map((j) => ({
        source: "smartrecruiters",
        company: co,
        title: j.name,
        location: [j.location?.city, j.location?.country?.toUpperCase()].filter(Boolean).join(", "),
        url: `https://jobs.smartrecruiters.com/${j.company?.identifier || ""}/${j.id}`,
        posted: j.releasedDate || null,
      })),
  },
  ashby: {
    url: (slug) => `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
    parse: (d, co) =>
      (d.jobs || []).map((j) => ({
        source: "ashby",
        company: co,
        title: j.title,
        location: j.location || "",
        url: j.jobUrl,
        posted: j.publishedAt || null,
      })),
  },
};

/** MLH names a season by the year it ends: events from August onwards belong to next year's season. */
export const mlhSeason = (d = new Date()) => d.getUTCFullYear() + (d.getUTCMonth() >= 7 ? 1 : 0);

const usAuthorised = (profile) => targetCountries(profile).some((c) => /^(us|u\.s\.|usa|united states)/i.test(String(c).trim()));

/**
 * The title rule for the J.P. Morgan source. Its search returns full-time roles next to the student
 * ones, and its rows travel as opportunities, so the INTERN_RE filter in main() never sees them.
 *
 * Kept: a student role. That is an INTERN_RE word, or graduate / apprentice / early careers /
 * undergraduate / industrial placement, or a student-programme word such as "summer"; and never a
 * title that EXCLUDE_RE rules out. Dropped: any senior title (Associate, Vice President, Director,
 * banker, ...) unless the same title also names a student programme. So "Summer Associate" is kept
 * and "Product Controller Associate" is dropped. Pure, so the self-test drives it directly.
 */
const STUDENT_RE = /\b(graduate|apprentice|apprenticeship|early careers?|undergraduate|industrial placement)\b/i;
const SENIOR_RE = /\b(vice president|executive director|managing director|associate|director|head of|lead|senior|principal|banker)\b/i;
const STUDENT_PROGRAMME_RE = /\b(intern|internship|summer|placement|graduate|apprentice|spring week|insight)\b/i;
export const jpmStudentRole = (title) => {
  const t = String(title || "");
  if (EXCLUDE_RE.test(t)) return false;
  const programme = STUDENT_PROGRAMME_RE.test(t);
  if (SENIOR_RE.test(t) && !programme) return false;
  return programme || INTERN_RE.test(t) || STUDENT_RE.test(t);
};

/**
 * OPPORTUNITIES — the half worth most: the things you would never have found.
 * Job boards only surface what you already knew to look for. Hackathons, events, talks and
 * programmes are where the "I only heard about this because someone forwarded it" opportunities
 * live, and those are the ones worth surfacing.
 *
 * Measured 2026-08-08: devpost's JSON API returns 9 open online hackathons; MLH and lu.ma serve
 * real server-rendered HTML (460KB / 510KB) so they can be parsed without a browser.
 */
export const OPPORTUNITY_SOURCES = [
  {
    name: "Devpost",
    kind: "hackathon",
    url: "https://devpost.com/api/hackathons?challenge_type[]=online&status[]=open&order_by=deadline",
    parse: (d) =>
      (d.hackathons || []).map((h) => ({
        source: "devpost",
        kind: "hackathon",
        company: h.organization_name || "Devpost",
        title: h.title,
        location: (h.displayed_location?.location || "Online").trim(),
        url: h.url?.startsWith("http") ? h.url : `https:${h.url}`,
        deadline: h.submission_period_dates || null,
        prize: h.prize_amount ? String(h.prize_amount).replace(/<[^>]+>/g, "") : null,
      })),
  },
  {
    name: "MLH",
    kind: "hackathon",
    // mlh.io now 302s to www.mlh.com, which was rebuilt as an Inertia app. The old parser matched
    // `event-link` / `event-name` / `event-location` classes that no longer exist anywhere on the
    // page, so it returned zero rows — and zero rows from a source that still answers HTTP 200 is
    // exactly the failure that hides: no error, just less. The events are now a JSON payload in a
    // <script data-page="app"> tag, which is more stable than any class name.
    url: () => `https://www.mlh.com/seasons/${mlhSeason()}/events`,
    html: true,
    parse: (html) => {
      const m = /<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
      if (!m) return [];
      let data;
      try {
        data = JSON.parse(m[1]);
      } catch {
        return [];
      }
      return (data.props?.upcomingEvents || []).map((e) => ({
        source: "mlh",
        kind: "hackathon",
        company: e.name,
        title: e.name,
        location: e.location || (e.formatType === "digital" ? "Online" : ""),
        url: e.websiteUrl || `https://www.mlh.com${e.url || ""}`,
        posted: e.startsAt || null,
        // The event ending is the honest deadline: once it is over there is nothing to enter.
        deadline_date: e.endsAt ? String(e.endsAt).slice(0, 10) : null,
        deadline: e.dateRange || null,
      }));
    },
  },
  {
    // J.P. Morgan runs its whole careers site on Oracle Cloud Recruiting, which publishes a public
    // REST API — no key, no scraping, and it is the same endpoint the site's own front end calls.
    // JPMC is one of the largest UK graduate tech employers and was completely absent from the board.
    //
    // The keyword search is fuzzy (asking for "intern" returns Executive Director roles), so the
    // queries are only there to keep the payload small. The real filtering is done HERE: the
    // profile's location check, then jpmStudentRole() on the title. There is no title rule
    // downstream for these rows: they travel as opportunities, and only job-board rows go through
    // the INTERN_RE filter in main(). Without this filter, full-time Associate, Vice President and
    // banker roles reached the board and were given tailored CVs.
    name: "J.P. Morgan",
    kind: "job",
    url: null, // fetched per keyword below
    fetchAll: async (ua, profile) => {
      const KEYWORDS = ["summer analyst", "internship", "graduate programme", "placement"];
      const byId = new Map();
      for (const kw of KEYWORDS) {
        const u =
          "https://jpmc.fa.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions" +
          `?finder=findReqs;siteNumber=CX_1001,limit=200,offset=0,sortBy=POSTING_DATES_DESC,keyword=${encodeURIComponent(kw)}&expand=all`;
        const r = await fetch(u, { headers: { accept: "application/json", "user-agent": ua }, signal: AbortSignal.timeout(40000) });
        if (!r.ok) continue;
        const d = await r.json();
        for (const q of d.items?.[0]?.requisitionList || []) byId.set(q.Id, q);
      }
      return [...byId.values()]
        .filter((q) => inRange(q.PrimaryLocation || "", profile))
        .filter((q) => jpmStudentRole(q.Title))
        .map((q) => ({
          source: "jpmorgan",
          kind: "job",
          company: "J.P. Morgan",
          title: q.Title,
          location: q.PrimaryLocation,
          url: `https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/${q.Id}`,
          posted: q.PostedDate || null,
        }));
    },
  },
  {
    // Pitt CSC + Simplify maintain the largest open internship list there is, updated daily. The
    // README is an HTML table, but the repo also publishes the underlying data as JSON — 14,377 rows,
    // of which ~1,650 are active — so there is no reason to parse markup.
    //
    // It carries a `sponsorship` field: a row that says "U.S. Citizenship is Required" is not an
    // opportunity unless your profile lists the US, so it is dropped here rather than surfacing and
    // being ruled out later. The repository is named after the intake year, which comes from your
    // profile (target.timing.intake_year).
    name: "Simplify",
    kind: "job",
    url: (profile) => {
      const year = intake(profile).year || mlhSeason();
      return `https://raw.githubusercontent.com/SimplifyJobs/Summer${year}-Internships/dev/.github/scripts/listings.json`;
    },
    parse: (d, profile) => {
      if (!Array.isArray(d)) return [];
      return d
        .filter((r) => r.active && r.is_visible !== false && r.url)
        .filter((r) => (r.locations || []).some((l) => inRange(l, profile)))
        .filter((r) => usAuthorised(profile) || !/U\.S\. Citizenship is Required/i.test(r.sponsorship || ""))
        .map((r) => ({
          source: "simplify",
          kind: "job",
          company: r.company_name,
          title: r.title,
          location: (r.locations || []).join(" / ") || "Unspecified",
          url: r.url,
          posted: r.date_posted ? new Date(r.date_posted * 1000).toISOString() : null,
          description: [r.category, (r.terms || []).join(", "), r.sponsorship, (r.degrees || []).join(", ")]
            .filter(Boolean)
            .join(" · "),
        }));
    },
  },
  {
    // Junction runs Europe's largest hackathon plus the JunctionX series, and none of it appears on
    // Devpost or MLH — so without this source those events were simply invisible.
    //
    // hackjunction.app is a Next.js app whose listing page fetches its data client-side, so the HTML
    // is an empty shell. The data comes from a public tRPC endpoint, found by reading the page
    // chunk: `useQuery(api.event.getAllFutureEvents...)`. No key, no auth.
    /**
     * MORGAN STANLEY campus events. Found the hard way and worth writing down.
     *
     * Every event page returns HTTP 200 at exactly the same length (89,598 bytes when measured) —
     * different content. Diffing two of them showed the only difference in the whole document was
     * `event-id="21251"` on one div; everything else is client-side. The component's own script
     * (eventdetail/v1/.../site.min.js) names this endpoint, which returns EVERY student event as
     * JSON — 24 of them, where browsing by hand had found five.
     *
     * TWO FIELDS THAT MATTER AND ARE NOT OBVIOUS:
     *
     *   eventDetailUrl  the tal.net (Lumesse TalentLink) page, which is where you actually register.
     *                   The morganstanley.com page has no form on it at all. Getting this wrong
     *                   points the filler at marketing copy and it reports "no fields found", which
     *                   reads as a broken tool rather than as the wrong URL.
     *
     *   eventEndDate    for a single event this is BEFORE eventStartDate, because it is the
     *                   REGISTRATION CLOSE, not the end of the event. 20 of the 24 are like that.
     *                   The four where end > start are series or evergreen mailing lists, and there
     *                   it genuinely is a window end. Both readings give the same answer to the only
     *                   question that matters — "can I still register today?" — so it is used as the
     *                   deadline either way, and a registration that has closed is caught
     *                   automatically instead of by hand.
     */
    name: "Morgan Stanley campus events",
    kind: "event",
    url: "https://www.morganstanley.com/web/career_services/webapp/service/careerservice/eventdetails.json?category=sg",
    // Measured 2026-08-17: the declared agent gets HTTP 503, a browser string gets the same JSON.
    browserUA: true,
    parse: (d) => {
      const strip = (s) =>
        String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, " ").trim();
      const iso = (s) => {
        const t = Date.parse(`${s} UTC`);
        return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
      };
      return (d?.eventResults || [])
        .filter((e) => e.eventDetailUrl)
        .map((e) => ({
          source: "morgan-stanley",
          kind: "event",
          company: "Morgan Stanley",
          title: strip(e.eventTitle),
          // eventCountry is a comma-separated list on the EMEA-wide ones. Left whole so the
          // eligibility gate can see "United Kingdom" in it.
          location: strip(e.eventCountry) || "United Kingdom",
          url: e.eventDetailUrl,
          deadline_date: iso(e.eventEndDate),
          deadline: `registration closes ${e.eventEndDate}; event ${e.eventStartDate}${e.eventTime ? ` at ${e.eventTime}` : ""}`,
          description: `${strip(e.eventDescription)} ${strip(e.eventAddress)} Audience: ${strip(e.eventAudience)}. Format: ${strip(e.eventFormat)}. Business unit: ${strip(e.businessUnit)}.`.trim(),
        }));
    },
  },
  {
    name: "Junction",
    kind: "hackathon",
    url: "https://hackjunction.app/api/trpc/event.getAllFutureEvents",
    parse: (d) => {
      const events = d?.result?.data?.json;
      if (!Array.isArray(events)) return [];
      const now = Date.now();
      return events
        .filter((e) => e.eventStatus === "published")
        // "Future event" is Junction's word for the EVENT date, not the application window — of the
        // seven live on 2026-08-13, one had already stopped accepting people. An event you cannot
        // enter is not an opportunity, so the registration window is what filters here.
        .filter((e) => {
          const opens = e.registrationStartTime ? Date.parse(e.registrationStartTime) : null;
          const closes = e.registrationEndTime ? Date.parse(e.registrationEndTime) : null;
          if (closes && closes < now) return false;
          if (opens && opens > now) return false;
          return true;
        })
        .map((e) => ({
          source: "junction",
          kind: "hackathon",
          company: "Junction",
          title: e.name,
          // The API publishes eventType but no city, and the city is exactly what decides whether
          // you can attend. Say what is known rather than guessing one out of the event name
          // — "JunctionX Korea" is a guessable city, "Hackathon for Good 8" is not.
          location: e.eventType === "online" ? "Online" : "In person — city in the posting",
          url: `https://hackjunction.app/hackathons/${e.slug}`,
          description: String(e.description || "").replace(/\s+/g, " ").trim(),
          posted: e.registrationStartTime || null,
          // For a hackathon the honest deadline is when applications shut, not when it starts.
          deadline_date: e.registrationEndTime ? String(e.registrationEndTime).slice(0, 10) : null,
          deadline: e.registrationEndTime
            ? `applications close ${String(e.registrationEndTime).slice(0, 10)}`
            : null,
        }));
    },
  },
];

async function fetchOpportunities(profile) {
  const rows = [];
  const errors = [];
  const UA = userAgent();
  for (const s of OPPORTUNITY_SOURCES) {
    try {
      // A source that needs more than one request builds its own rows; everything else is one GET.
      if (s.fetchAll) {
        const parsed = await s.fetchAll(UA, profile);
        rows.push(...parsed);
        console.error(`  ${s.name.padEnd(18)} ${s.kind.padEnd(11)} ${parsed.length} found`);
        continue;
      }
      // The declared agent stays the default: saying who you are is the right manners, and every
      // other source here accepts it. Morgan Stanley's CDN does not — and the failure was narrower
      // and more interesting than "it blocks bots". Measured, one variable at a time:
      //
      //   career-agent/0.1 (…)                              503
      //   Mozilla/5.0                                       200
      //   Chrome/140.0 Safari/537.36                        200
      //   Chrome/140.0 Safari/537.36 career-agent/0.1 (…)   503   ← the SUFFIX is what trips it
      //
      // So a browser string with the contact appended is refused, which rules out the obvious
      // compromise. If you set CAREER_AGENT_CONTACT to an email, it goes in `From:` instead — the
      // header that has meant exactly "the human responsible for this request" since RFC 1945.
      //
      // Opt-in per source and explicit: the moment this becomes the default, nobody can tell which
      // sources actually needed it.
      const url = typeof s.url === "function" ? s.url(profile) : s.url;
      const r = await fetch(url, {
        headers: s.browserUA
          ? {
              accept: "application/json, text/html;q=0.9,*/*;q=0.8",
              "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
              ...fromHeader(),
            }
          : { "user-agent": UA },
        signal: AbortSignal.timeout(25000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = s.html ? await r.text() : await r.json();
      const parsed = s.parse(body, profile);
      rows.push(...parsed);
      console.error(`  ${s.name.padEnd(18)} ${s.kind.padEnd(11)} ${parsed.length} found`);
    } catch (e) {
      errors.push(`${s.name}: ${e.message}`);
      console.error(`  ${s.name.padEnd(18)} ${s.kind.padEnd(11)} FAILED — ${e.message}`);
    }
  }
  return { rows, errors };
}

/**
 * ENRICHMENT — fetch each shortlisted posting's full text.
 *
 * This is the step whose absence produced the 408-day-old recommendation: eligibility, intake year,
 * year group and closing dates all live in the description, and ranking without it is guessing.
 * Only the shortlist is enriched (a few dozen), never all 3,600 postings.
 */
const ENRICHERS = {
  // Oracle Cloud Recruiting publishes the full requisition, including the description and the closing
  // date, at a documented public endpoint. Without it a JPMC row is a title and nothing else, and the
  // eligibility gate would be guessing at exactly the things the description states outright.
  jpmorgan: async (item) => {
    const id = item.url.match(/\/job\/(\d+)/)?.[1];
    if (!id) return null;
    const d = await fetchJSON(
      "https://jpmc.fa.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails" +
        `?expand=all&finder=ById;Id=%22${id}%22,siteNumber=CX_1001`,
    );
    const q = d.items?.[0];
    if (!q) return null;
    const strip = (h) =>
      String(h || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, " ").trim();
    return {
      description: strip(q.ExternalDescriptionStr),
      posted: q.ExternalPostedStartDate || item.posted,
      deadline_date: q.ExternalPostedEndDate ? String(q.ExternalPostedEndDate).slice(0, 10) : null,
    };
  },
  lever: async (item) => {
    const id = item.url.split("/").pop();
    const co = item.url.match(/jobs\.lever\.co\/([^/]+)/)?.[1];
    if (!id || !co) return null;
    const d = await fetchJSON(`https://api.lever.co/v0/postings/${co}/${id}`);
    return {
      description: [d.descriptionPlain, d.additionalPlain].filter(Boolean).join("\n\n"),
      posted: d.createdAt ? new Date(d.createdAt).toISOString() : item.posted,
    };
  },
  greenhouse: async (item) => {
    const m = item.url.match(/boards\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/) ||
              item.url.match(/job-boards\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/);
    if (!m) return null;
    const d = await fetchJSON(`https://boards-api.greenhouse.io/v1/boards/${m[1]}/jobs/${m[2]}`);
    return {
      description: String(d.content || "").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " "),
      posted: d.updated_at || item.posted,
    };
  },
};

async function enrich(items) {
  let ok = 0, failed = 0;
  for (const item of items) {
    const fn = ENRICHERS[item.source];
    if (!fn) continue;
    try {
      const extra = await fn(item);
      if (extra) { Object.assign(item, extra); ok++; }
    } catch (e) {
      // Recorded on the item so the dashboard can say "could not read this posting" rather than
      // silently treating an unreadable posting as a clean one.
      item.enrich_error = e.message;
      failed++;
    }
  }
  console.error(`  enriched ${ok} postings${failed ? `, ${failed} failed (flagged, not assumed clean)` : ""}`);
}

/** Which of your boost keywords (target.boost_keywords) this text names, as whole words. */
export function boostHits(text, profile) {
  return boostKeywords(profile).filter((k) => new RegExp(`\\b${String(k).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
}

/** Why this one is worth your time: home city, in range, your boost keywords, your intake. */
export function score(job, profile) {
  let s = 0;
  const hay = `${job.title} ${job.location}`;
  const home = homeRegex(profile);
  if (home && home.test(hay)) s += 3; // no relocation
  else if (inRange(job.location, profile) || inRange(job.title, profile)) s += 1;
  s += Math.min(4, 2 * boostHits(hay, profile).length);
  if (/software engineer|swe/i.test(hay)) s += 1;
  const { season, year } = intake(profile);
  if ((year && hay.includes(String(year))) || (season && hay.toLowerCase().includes(season))) s += 1;
  return s;
}

/**
 * Opportunities score differently from jobs: hackathons and events are a proven route to evidence,
 * contacts and CV lines, so everything starts above zero. Local and on-topic rank highest.
 */
export function scoreOpportunity(o, profile) {
  let s = 1; // everything you would not otherwise have seen starts above zero
  const hay = `${o.title} ${o.location} ${o.company}`;
  const home = homeRegex(profile);
  if (home && home.test(hay)) s += 4;
  else if (inRange(o.location, profile) && !/\b(online|virtual|remote)\b/i.test(o.location || "")) s += 2;
  else if (/\b(online|virtual|remote)\b/i.test(hay)) s += 1;
  const hits = boostHits(hay, profile).length;
  if (hits) s += 3 + Math.min(2, hits - 1) * 2;
  if (o.prize) s += 1;
  return s;
}

async function main() {
  const profile = loadProfile();
  // jobs/sources.json when you have one; until then the shipped example for your sector.
  const sourcesFile = sourcesFileFor(profile, { root: ROOT });
  if (sourcesFile !== SOURCES)
    console.error(`  using ${path.relative(ROOT, sourcesFile)} — copy it to jobs/sources.json and edit it to choose your own employers`);
  const sources = JSON.parse(fs.readFileSync(sourcesFile, "utf8"));
  const stored = fs.existsSync(FOUND) ? JSON.parse(fs.readFileSync(FOUND, "utf8")) : { jobs: [] };
  // A board built for another field is not merged into: its rows passed a different filter.
  const fingerprint = fieldFingerprint(profile);
  const board = boardForField(stored, fingerprint);
  if (board.cleared)
    console.error(`  your field changed since the last run — previous board cleared (${stored.jobs.length} row(s) removed from jobs/found.json)`);
  const prev = { ...stored, jobs: board.jobs };
  const seen = new Set(prev.jobs.map((j) => j.url));

  const all = [];
  const errors = [];
  for (const src of sources.tier1) {
    const ad = ADAPTERS[src.ats];
    if (!ad) {
      errors.push(`${src.company}: unknown ATS "${src.ats}"`);
      continue;
    }
    try {
      const data = await fetchJSON(ad.url(src.slug));
      const rows = ad.parse(data, src.company);
      all.push(...rows);
      console.error(`  ${src.company.padEnd(18)} ${src.ats.padEnd(11)} ${rows.length} postings`);
    } catch (e) {
      // A dead board is reported, never silently treated as "no jobs today" — that is how a broken
      // source turns into a quiet false negative and you stop seeing a whole company.
      errors.push(`${src.company} (${src.ats}/${src.slug}): ${e.message}`);
      console.error(`  ${src.company.padEnd(18)} ${src.ats.padEnd(11)} FAILED — ${e.message}`);
    }
  }

  // JOB APIS (scripts/sources-api.mjs): Adzuna and Reed when their free keys are set; Apify's
  // LinkedIn/Indeed scrapers only with APIFY_TOKEN. With no key: one "not configured" line and no
  // network call. Their rows join the job-board rows, so
  // matchJobs below gives them the very same filter (internship, field, exclusions, location).
  const api = await fetchApiSources(profile, { known: new Set(all.map((j) => normalizeUrl(j.url))), keep: (rows) => matchJobs(rows, profile) });
  all.push(...api.rows);
  errors.push(...api.errors);

  console.error("\n  --- opportunities (hackathons, events, programmes) ---");
  const opp = await fetchOpportunities(profile);
  errors.push(...opp.errors);

  // Anything you find yourself. Plenty of real programmes are not on any ATS or aggregator — some run
  // their whole application on a survey platform, and nothing this tool crawls would ever surface
  // them. A hand-written row in jobs/manual.json goes through the identical
  // eligibility, tailoring, CV and grounding pipeline as a discovered one, so pasting a link is all
  // it takes to get a CV and a form pack for it.
  const MANUAL = path.join(ROOT, "jobs", "manual.json");
  if (fs.existsSync(MANUAL)) {
    const manual = JSON.parse(fs.readFileSync(MANUAL, "utf8"));
    const rows = (manual.opportunities || []).map((m) => ({ source: "manual", kind: "job", ...m }));
    opp.rows.push(...rows);
    console.error(`  ${"manual".padEnd(18)} ${"hand-added".padEnd(11)} ${rows.length} found`);
  }
  // DEDUPE, manual wins. A hand-added row and a crawled row can describe the same thing, and only the
  // hand-added one carries `priority`, which is your instruction. Losing that to a crawler would be the
  // wrong way round, and keeping both would put the same event on the board twice.
  {
    const byUrl = new Map();
    for (const o of opp.rows) {
      const prev = byUrl.get(o.url);
      if (!prev || (o.source === "manual" && prev.source !== "manual")) byUrl.set(o.url, o);
    }
    if (byUrl.size !== opp.rows.length)
      console.error(`  ${"dedupe".padEnd(18)} ${"".padEnd(11)} ${opp.rows.length - byUrl.size} duplicate url(s) collapsed, manual kept`);
    opp.rows = [...byUrl.values()];
  }
  // A finance or marketing student is not shown a list of CS internships and AI hackathons: for a
  // non-tech profile, discovered opportunities must name the field too (hand-added rows always stay).
  {
    const before = opp.rows.length;
    opp.rows = fieldOpportunities(opp.rows, profile);
    if (opp.rows.length !== before)
      console.error(`  ${"field filter".padEnd(18)} ${"".padEnd(11)} ${before - opp.rows.length} outside your field dropped (see "field words" below)`);
  }

  const opportunities = opp.rows
    .map((o) => ({ ...o, score: scoreOpportunity(o, profile), first_seen: new Date().toISOString().slice(0, 10) }))
    .sort((a, b) => b.score - a.score);
  // Events are gated too, on their own terms.

  // Job-board titles must name the attendee's field: TECH_RE for a tech profile, otherwise the words
  // of target.title_keywords or target.roles (fieldWords). Said out loud, so a thin board can be fixed.
  const field = fieldWords(profile);
  if (field.from !== "tech") {
    console.error(`\n  field words (from target.${field.from}): ${field.words.join(", ") || "none"}`);
    if (!field.words.length)
      console.error(`  no field word could be read from target.roles, so every internship is kept — add target.title_keywords, e.g. ["law", "legal"]`);
  }
  const matchedRaw = matchJobs(all, profile).map((j) => ({ ...j, kind: "job", first_seen: new Date().toISOString().slice(0, 10) }));

  console.error("\n  --- enrichment (fetching full postings for the shortlist) ---");
  await enrich(matchedRaw);

  // Applied AND ignored both count as decided: a posting you dealt with is never shown twice, and
  // "new since last run" is exactly where a dismissed posting would otherwise come back.
  const decided = decisions(ROOT);
  const appliedUrls = new Set(
    [...decided.entries()].filter(([, d]) => d.decision === "applied").map(([u]) => u),
  );

  const matched = matchedRaw
    .map((j) => ({ ...j, score: score(j, profile), eligibility: assess(j, { profile, appliedUrls }) }))
    .sort((a, b) => b.score - a.score);

  for (const o of opportunities) o.eligibility = assess(o, { profile, appliedUrls: new Set() });
  const freshOpps = opportunities.filter((o) => !seen.has(o.url) && !isDecided(decided, o.url));
  const fresh = [...matched.filter((j) => !seen.has(j.url) && !isDecided(decided, j.url)), ...freshOpps];

  console.error(
    `\n${all.length} postings fetched · ${matched.length} match (internship in your field, in your target locations) · ${fresh.length} new since last run`,
  );
  if (errors.length) {
    console.error(`\n${errors.length} source(s) FAILED — reported, not swallowed:`);
    for (const e of errors) console.error(`  ${e}`);
  }

  const tally = (rows) => {
    const c = { eligible: 0, check: 0, ineligible: 0 };
    for (const r of rows) c[r.eligibility?.verdict ?? "check"]++;
    return `${c.eligible} eligible · ${c.check} needs a look · ${c.ineligible} ineligible`;
  };
  console.error(`${opportunities.length} opportunities · ${freshOpps.length} new`);
  console.error(`\nELIGIBILITY  jobs: ${tally(matched)}\n             opps: ${tally(opportunities)}`);
  const rows = ONLY_NEW ? fresh : [...matched, ...opportunities];
  for (const j of rows.slice(0, 40)) {
    const tag = (j.kind || "job").toUpperCase().slice(0, 9).padEnd(9);
    console.log(`[${String(j.score).padStart(2)}] ${tag} ${j.company.slice(0, 16).padEnd(16)} ${j.title.slice(0, 54).padEnd(54)} ${j.location.slice(0, 22)}`);
    console.log(`     ${j.url}`);
  }

  if (!DRY) {
    const merged = [...prev.jobs];
    for (const j of fresh) merged.push(j);

    // RE-ASSESS EVERY ROW, not just the new ones.
    //
    // Until this line existed, a stored verdict was written once and never revisited: `assess` ran on
    // fresh rows, and everything downstream only filled in a verdict when one was MISSING. So
    // improving an eligibility rule changed nothing about the board. It was caught by the
    // employment-type rule, which ruled out a batch of Vice President postings when run directly and
    // exactly zero of them after a real discovery run.
    //
    // That is evaluator decay in its purest form — a gate that got better while the thing it guards
    // stayed exactly as wrong, with nothing anywhere reporting a problem. `assess` is pure and cheap
    // (a few regexes over a few hundred rows), so there is no reason to cache its answer across a
    // code change that may have altered it.
    //
    // Deadlines move on their own too: a row assessed as open in June is not open in August, and
    // re-running the rules is also what keeps that honest.
    // REFRESH HAND-ADDED ROWS FROM manual.json FIRST.
    //
    // Same class of bug as the stale verdicts, found the same way — by an opportunity being wrong on
    // the board and the fix having no effect. discover.mjs merges on URL and only ever ADDS, so
    // editing a row in manual.json changed nothing about a row already stored. A hackathon sat on the
    // board as `kind: "job"` long after manual.json said "hackathon", which put it through the JOB
    // rules, where `intakeYear` read the year in its title as an earlier intake and ruled out a live
    // opportunity.
    //
    // manual.json is the source of truth for the rows it owns. Anything hand-added is re-read from it
    // on every run, and the fields the pipeline computes (score, eligibility, first_seen) are kept.
    const manualByUrl = new Map(opp.rows.filter((o) => o.source === "manual").map((o) => [o.url, o]));
    let refreshed = 0;
    for (let i = 0; i < merged.length; i++) {
      const src = manualByUrl.get(merged[i].url);
      if (!src) continue;
      const before = JSON.stringify({ ...merged[i], eligibility: 0, score: 0 });
      merged[i] = { ...merged[i], ...src, first_seen: merged[i].first_seen, score: merged[i].score };
      if (JSON.stringify({ ...merged[i], eligibility: 0, score: 0 }) !== before) refreshed++;
    }
    if (refreshed) console.error(`\n${refreshed} hand-added row(s) refreshed from manual.json.`);

    // Re-assess EVERY row every run, not just the new ones. Stored verdicts going stale is a bug this
    // project has already been bitten by twice: a rule change once had zero effect because 81 rows
    // were carrying answers from the old rules, and a manual.json edit once never reached the board.
    let changed = 0;
    let rebarred = 0;
    for (const j of merged) {
      const before = j.eligibility?.verdict;
      j.eligibility = assess(j, { profile, appliedUrls });
      if (before && before !== j.eligibility.verdict) changed++;

      // The SECOND axis: eligibility says whether you CAN apply, `bar` says whether it is worth it
      // (and worth declining any offer you hold). Recomputed here for the same reason.
      const wasTier = j.bar?.tier;
      j.bar = rank(j, barConfig(profile));
      if (wasTier && wasTier !== j.bar.tier) rebarred++;
    }
    if (changed) console.error(`\n${changed} stored verdict(s) changed when the current rules were re-run over the whole board.`);
    if (rebarred) console.error(`${rebarred} row(s) changed tier against your bar.`);
    fs.mkdirSync(path.dirname(FOUND), { recursive: true });
    fs.writeFileSync(FOUND, JSON.stringify({ updated: new Date().toISOString(), field_fingerprint: fingerprint, jobs: merged }, null, 2) + "\n");
    console.error(`\nwrote ${FOUND} (${merged.length} total, ${fresh.length} added)`);
  }
  // Fail loudly if EVERY source broke — that means the run produced nothing and should not look calm.
  // A failed job API is reported above, but it is not one of the boards this check counts.
  const notApi = errors.length - api.errors.length;
  if (notApi && notApi === sources.tier1.length) {
    console.error("\nRESULT: FAIL — every source failed. This is not 'no jobs today'.");
    process.exit(1);
  }
}

/**
 * SELF-TEST — the Junction parser, proven to REJECT as well as accept.
 *
 * The whole value of this source is the registration-window filter: Junction's own endpoint is
 * called `getAllFutureEvents` and on 2026-08-13 one of the seven it returned had stopped accepting
 * applications eleven days earlier. A parser that only passes the good case would put that event on
 * the board, and you would find out by opening a closed form.
 */
async function selfTest() {
  // A promise that never settles (a timeout that never fires, a stub never answered) lets Node exit
  // with code 0 halfway through, and a half-run self-test would read as a pass. It must not.
  let finished = false;
  process.on("exit", (code) => {
    if (!finished && code === 0) {
      console.log("\nself-test FAILED — it stopped before its last row (a request or timer never settled)");
      process.exitCode = 1;
    }
  });
  const junction = OPPORTUNITY_SOURCES.find((s) => s.name === "Junction");
  const day = 86400000;
  const iso = (offset) => new Date(Date.now() + offset).toISOString();
  const ev = (over) => ({
    name: "Test Event",
    slug: "test-event",
    description: "  a   hackathon\n\ndescription  ",
    eventType: "physical",
    eventStatus: "published",
    registrationStartTime: iso(-10 * day),
    registrationEndTime: iso(10 * day),
    ...over,
  });

  const cases = [
    ["registration open", ev(), true],
    ["registration already closed", ev({ registrationEndTime: iso(-1 * day) }), false],
    ["registration not open yet", ev({ registrationStartTime: iso(1 * day) }), false],
    ["not published", ev({ eventStatus: "draft" }), false],
    ["closes today, still open", ev({ registrationEndTime: iso(1000) }), true],
  ];

  let bad = 0;
  for (const [label, e, want] of cases) {
    const got = junction.parse({ result: { data: { json: [e] } } }).length === 1;
    const ok = got === want;
    if (!ok) bad++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(28)} kept=${got} want=${want}`);
  }

  // A shape that is not what the endpoint returns must yield nothing rather than throw — a source
  // that crashes the run takes the other 90 opportunities down with it.
  for (const [label, input] of [["null body", null], ["empty object", {}], ["array at top level", []]]) {
    let got;
    try {
      got = junction.parse(input);
    } catch (e) {
      got = "THREW " + e.message;
    }
    const ok = Array.isArray(got) && got.length === 0;
    if (!ok) bad++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(28)} ${ok ? "[]" : JSON.stringify(got)}`);
  }

  // And the fields the rest of the pipeline reads must actually be populated.
  const [row] = junction.parse({ result: { data: { json: [ev()] } } });
  const fields = ["source", "kind", "company", "title", "url", "deadline_date"];
  const missing = fields.filter((f) => !row?.[f]);
  if (missing.length) bad++;
  console.log(`  ${missing.length ? "FAIL" : "PASS"}  ${"row is fully populated".padEnd(28)} ${missing.length ? "missing " + missing : row.url}`);
  if (row?.description !== "a hackathon description") {
    bad++;
    console.log(`  FAIL  description not squashed       ${JSON.stringify(row?.description)}`);
  }

  // GENERIC, both ways: scoring and the location filter read the profile, never this file. Run on the
  // FICTIONAL example profile, then on a copy that lives somewhere else — the same posting must move.
  const ex = loadExample();
  const home = ex.target.bar.home_cities[0];
  const local = { title: "Software Engineer Intern", location: `${home}, United Kingdom` };
  const far = { title: "Software Engineer Intern", location: "Lisbon, Portugal" };
  const moved = { ...ex, target: { ...ex.target, locations: ["Lisbon"], countries: ["Portugal"], bar: { ...ex.target.bar, home_cities: ["Lisbon"] } } };
  const t = (label, ok, detail) => {
    if (!ok) bad++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(60)} ${ok ? "" : detail}`);
  };
  t("home city scores above a city outside the profile", score(local, ex) > score(far, ex), `${score(local, ex)} vs ${score(far, ex)}`);
  t("...and the order flips for a profile that lives elsewhere", score(far, moved) > score(local, moved), `${score(far, moved)} vs ${score(local, moved)}`);
  t("a boost keyword from the profile raises the score", score({ ...far, title: "Backend Engineer Intern" }, ex) > score(far, ex), "");
  const simplify = OPPORTUNITY_SOURCES.find((x) => x.name === "Simplify");
  const listing = [
    { active: true, url: "https://example.com/a", company_name: "A", title: "Intern", locations: [`${home}, UK`], sponsorship: "Offers Sponsorship" },
    { active: true, url: "https://example.com/b", company_name: "B", title: "Intern", locations: ["Remote in UK"], sponsorship: "U.S. Citizenship is Required" },
    { active: true, url: "https://example.com/c", company_name: "C", title: "Intern", locations: ["Austin, TX"], sponsorship: "Offers Sponsorship" },
  ];
  const kept = simplify.parse(listing, ex).map((r) => r.company);
  t("Simplify keeps rows in the profile's locations", kept.includes("A") && !kept.includes("C"), JSON.stringify(kept));
  t("Simplify drops US-citizenship rows for a profile without the US", !kept.includes("B"), JSON.stringify(kept));
  t("Simplify's list URL is built from the profile's intake year", simplify.url(ex).includes(`Summer${ex.target.timing.intake_year}-`), simplify.url(ex));

  // J.P. Morgan: student roles only. Its rows are opportunities, so no downstream title rule sees
  // them; the rule lives in the source. Both ways: each KEPT title must pass, each DROPPED must not.
  const JPM_KEPT = [
    "2027 Summer Analyst Program",
    "Software Engineer Program - Graduate",
    "Spring Week 2026",
    "Industrial Placement - Technology",
    "Corporate & Investment Bank Summer Associate",
    "Insight Programme",
  ];
  const JPM_DROPPED = [
    "Product Controller Associate",
    "International Private Bank - Investment Specialist Vice President",
    "Asset Management - Internal Client Advisor - Associate",
    "Investment Banking - DACH ECM Analyst - London",
    "Executive Director, Software Engineering",
    "Private Banker - Saudi",
    // Matches INTERN_RE and is not senior; only the EXCLUDE_RE part of the rule drops it.
    "Internship Program Manager",
  ];
  for (const title of JPM_KEPT) t(`J.P. Morgan keeps "${title}"`, jpmStudentRole(title) === true, "dropped");
  for (const title of JPM_DROPPED) t(`J.P. Morgan drops "${title}"`, jpmStudentRole(title) === false, "kept");
  // ...and the source really applies the rule: its fetchAll runs on a stubbed API answer that holds
  // every title above, in a city the profile accepts. A rule that exists but is not wired in fails here.
  const jpm = OPPORTUNITY_SOURCES.find((x) => x.name === "J.P. Morgan");
  const requisitionList = [...JPM_KEPT, ...JPM_DROPPED].map((Title, i) => ({ Id: `t${i}`, Title, PrimaryLocation: `${home}, United Kingdom` }));
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ items: [{ requisitionList }] }) });
  let jpmTitles;
  try {
    jpmTitles = (await jpm.fetchAll("career-agent self-test", ex)).map((r) => r.title);
  } finally {
    globalThis.fetch = realFetch;
  }
  t("J.P. Morgan source returns only the student roles", [...jpmTitles].sort().join("|") === [...JPM_KEPT].sort().join("|"), JSON.stringify(jpmTitles));

  // THE ATTENDEE'S FIELD. A finance student was shown only CS roles, because the job-board filter
  // was TECH_RE for everyone. Both ways, for several fields; and the tech default byte-identical.
  const withTarget = (over) => ({ ...ex, target: { ...ex.target, title_keywords: undefined, ...over } });
  const inLondon = (title) => ({ title, location: "London, United Kingdom", url: `https://example.com/${encodeURIComponent(title)}` });
  const keeps = (p, title) => matchJobs([inLondon(title)], p).length === 1;
  const finance = withTarget({
    sector: "Finance",
    roles: ["Investment banking summer analyst", "Audit intern", "Finance placement"],
    boost_keywords: ["markets", "excel"],
    locations: ["Edinburgh", "London"],
  });
  const marketing = withTarget({ sector: "Marketing", roles: ["Marketing intern", "Brand placement"], boost_keywords: [], locations: ["London"] });
  const law = withTarget({ sector: "Law", roles: ["Legal intern", "Vacation scheme"], boost_keywords: [], locations: ["London"] });
  const sales = withTarget({ sector: "Sales", roles: ["Sales intern", "Business development placement"], boost_keywords: [], locations: ["London"] });
  const hr = withTarget({ sector: "Human resources", roles: ["HR intern", "People placement"], boost_keywords: [], locations: ["London"] });
  const people = withTarget({ sector: "People", roles: ["Human resources intern"], boost_keywords: [], locations: ["London"] });

  // Tech default: the same regex objects, so the filter cannot drift.
  t("a tech profile's field words are TECH_RE itself", fieldWordsRe(ex) === TECH_RE, String(fieldWordsRe(ex)));
  t("a tech profile's exclusions are EXCLUDE_RE itself", excludeRe(ex) === EXCLUDE_RE, String(excludeRe(ex)));
  t("EXCLUDE_TERMS spells exactly EXCLUDE_RE", new RegExp(`\\b(${EXCLUDE_TERMS.map(([x]) => x).join("|")})\\b`, "i").source === EXCLUDE_RE.source, "drifted");
  for (const sector of [undefined, "", "Technology", "Computer Science", "Software", "Data science", "IT", "Fintech"])
    t(`sector ${JSON.stringify(sector)} keeps TECH_RE`, fieldWordsRe(withTarget({ sector })) === TECH_RE, String(fieldWordsRe(withTarget({ sector }))));
  t(`sector "Audit" is not read as IT`, fieldWordsRe(withTarget({ sector: "Audit", roles: ["Audit intern"] })) !== TECH_RE, "read as tech");
  // ...and its results are today's, title by title: the old chain, inline, against matchJobs.
  const MIXED = [
    "Software Engineer Intern", "Data Analyst, Intern", "Security Engineering Placement", "Machine Learning Research Internship",
    "Audit Intern 2027", "Summer Analyst - Markets", "Investment Banking Summer Internship", "Marketing Intern - Consumer Brands",
    "Sales Intern", "HR Intern", "Internal Tools Engineer Intern", "Legal Vacation Scheme 2027", "Technology Vacation Scheme",
    "Recruiter - Engineering Internships", "Internship Program Manager, Engineering", "Brand Marketing Internship",
  ];
  const rows = MIXED.flatMap((title) => [inLondon(title), { ...inLondon(title), location: "Lisbon, Portugal" }]);
  const oldChain = rows
    .filter((j) => INTERN_RE.test(j.title) && !EXCLUDE_RE.test(j.title))
    .filter((j) => TECH_RE.test(j.title))
    .filter((j) => inRange(j.location, ex) || inRange(j.title, ex));
  const newChain = matchJobs(rows, ex);
  t(`the example profile keeps exactly today's titles (${oldChain.length} of ${rows.length})`, oldChain.length > 0 && oldChain.length < rows.length && JSON.stringify(newChain) === JSON.stringify(oldChain), `${newChain.length} vs ${oldChain.length}`);

  // Finance: the ticket's example, word for word.
  t("finance field words are investment, banking, audit, finance, markets, excel", fieldWords(finance).words.join(",") === "investment,banking,audit,finance,markets,excel", fieldWords(finance).words.join(","));
  for (const title of ["Summer Analyst - Markets", "Audit Intern 2027", "Investment Banking Summer Internship"])
    t(`finance keeps "${title}"`, keeps(finance, title), "dropped");
  t(`finance drops "Software Engineer Intern"`, !keeps(finance, "Software Engineer Intern"), "kept");
  t(`finance drops "Credit Analyst Intern" (analyst alone is not a field word)`, !keeps(finance, "Credit Analyst Intern"), "kept");
  t(`tech example drops "Audit Intern 2027"`, !keeps(ex, "Audit Intern 2027"), "kept");

  // Marketing and law: other fields, same rule, no field-specific code.
  t(`marketing keeps "Marketing Intern - Consumer Brands"`, keeps(marketing, "Marketing Intern - Consumer Brands"), "dropped");
  t(`marketing drops "Software Engineer Intern"`, !keeps(marketing, "Software Engineer Intern"), "kept");
  t(`tech example drops "Marketing Intern - Consumer Brands"`, !keeps(ex, "Marketing Intern - Consumer Brands"), "kept");
  t(`law keeps "Legal Vacation Scheme 2027"`, keeps(law, "Legal Vacation Scheme 2027"), "dropped");
  t(`law drops "Software Engineer Intern"`, !keeps(law, "Software Engineer Intern"), "kept");
  t(`tech example drops "Technology Vacation Scheme" (INTERN_RE unchanged)`, !keeps(ex, "Technology Vacation Scheme"), "kept");

  // "insight" only as a student programme. A bare "insight" put full-time "Lead Insight Analyst -
  // Marketing & Acquisition" on a marketing student's board. Both ways, on the regex and on the board.
  for (const title of ["Lead Insight Analyst - Marketing & Acquisition", "Consumer Insight Manager", "Insight Analyst"])
    t(`INTERN_RE drops full-time "${title}"`, !INTERN_RE.test(title), "matched");
  t(`marketing drops "Lead Insight Analyst - Marketing & Acquisition"`, !keeps(marketing, "Lead Insight Analyst - Marketing & Acquisition"), "kept");
  for (const title of ["Spring Insight Week", "Insight Programme", "Insight Day - Marketing", "2027 Spring Insight: Careers Across Finance, Risk & Business", "Technology Insight Weeks", "Insight Evening", "Insight Series 2027"])
    t(`INTERN_RE keeps student programme "${title}"`, INTERN_RE.test(title), "not matched");
  t(`marketing keeps "Marketing Spring Insight Week"`, keeps(marketing, "Marketing Spring Insight Week"), "dropped");
  t(`tech example keeps "Technology Insight Programme"`, keeps(ex, "Technology Insight Programme"), "dropped");

  // An exclusion that names the profile's own field is skipped for that profile, and only for it.
  t(`marketing: "marketing intern" is not excluded`, !excludeRe(marketing).test("Marketing Intern"), String(excludeRe(marketing)));
  t(`tech example: "Marketing Intern" is still excluded`, EXCLUDE_RE.test("Marketing Intern") && excludeRe(ex).test("Marketing Intern"), "not excluded");
  t(`sales keeps "Sales Intern"`, keeps(sales, "Sales Intern"), "dropped");
  t(`tech example drops "Sales Intern"`, !keeps(ex, "Sales Intern") && excludeRe(ex).test("Sales Intern"), "kept");
  t(`HR (acronym kept) keeps "HR Intern - Summer 2027"`, fieldWords(hr).words.includes("hr") && keeps(hr, "HR Intern - Summer 2027"), fieldWords(hr).words.join(","));
  t(`"human resources" in roles switches off the "hr intern" exclusion`, !excludeRe(people).test("HR Intern"), String(excludeRe(people)));
  t(`tech example drops "HR Intern"`, !keeps(ex, "HR Intern"), "kept");
  t(`marketing still excludes "Internship Program Manager" and "Internal ..."`, excludeRe(marketing).test("Internship Program Manager") && excludeRe(marketing).test("Internal Audit Intern"), String(excludeRe(marketing)));
  t(`sales does not switch off the marketing exclusion`, excludeRe(sales).test("Marketing Intern") && !excludeRe(sales).test("Sales Intern"), String(excludeRe(sales)));

  // target.title_keywords overrides both the tech default and the words from target.roles.
  const techOwn = withTarget({ title_keywords: ["audit"] });
  t(`title_keywords ["audit"] on a tech sector keeps "Audit Intern 2027"`, keeps(techOwn, "Audit Intern 2027"), "dropped");
  t(`title_keywords ["audit"] on a tech sector drops "Software Engineer Intern"`, !keeps(techOwn, "Software Engineer Intern"), "kept");
  const financeOwn = { ...finance, target: { ...finance.target, title_keywords: ["analyst"] } };
  t(`title_keywords ["analyst"] keeps "Credit Analyst Intern" (analyst named)`, keeps(financeOwn, "Credit Analyst Intern"), "dropped");
  t(`title_keywords ["analyst"] drops "Audit Intern 2027" (roles ignored)`, !keeps(financeOwn, "Audit Intern 2027"), "kept");
  t(`title_keywords match whole words only`, !keeps(withTarget({ title_keywords: ["audit"] }), "Auditory Research Intern"), "kept");
  t(`roles with no usable word keep every internship (no empty board)`, keeps(withTarget({ sector: "Law", roles: ["Law intern"], boost_keywords: [] }), "Paralegal Intern"), "dropped");

  // main() really uses the rule: a rule that exists but is not wired in fails here.
  const mainSrc = fs.readFileSync(new URL(import.meta.url), "utf8").split("async function main()")[1].split("async function selfTest()")[0];
  t("main() filters job boards with matchJobs, not TECH_RE", /matchJobs\(all, profile\)/.test(mainSrc) && !/TECH_RE\.test/.test(mainSrc), "not wired");

  // What the opportunity sources find follows the same field rule; your own manual rows never drop.
  const OPPS = [
    { source: "simplify", kind: "job", title: "Software Engineer Intern" },
    { source: "jpmorgan", kind: "job", title: "Summer Analyst Programme: Global Markets Intern" },
    { source: "devpost", kind: "hackathon", title: "Global AI Builder's Challenge" },
    { source: "morgan-stanley", kind: "event", title: "2027 Spring Insight: Careers Across Finance, Risk & Business" },
    { source: "manual", kind: "job", title: "Software Engineer Intern" },
  ];
  const oppKept = fieldOpportunities(OPPS, finance).map((o) => `${o.source}:${o.title}`);
  t("finance opportunities: CS job and AI hackathon dropped, field rows and manual kept",
    oppKept.join("|") === "jpmorgan:Summer Analyst Programme: Global Markets Intern|morgan-stanley:2027 Spring Insight: Careers Across Finance, Risk & Business|manual:Software Engineer Intern", JSON.stringify(oppKept));
  t("marketing opportunities: only the hand-added row is left", fieldOpportunities(OPPS, marketing).map((o) => o.source).join() === "manual", JSON.stringify(fieldOpportunities(OPPS, marketing)));
  t("a tech profile's opportunities are the very same array", fieldOpportunities(OPPS, ex) === OPPS, "filtered");
  t("main() filters opportunities with fieldOpportunities", /fieldOpportunities\(opp\.rows, profile\)/.test(mainSrc), "not wired");

  // WEAK WORDS. A marketing student (roles "Marketing intern", "Social media intern", "Brand
  // placement"; boost "digital marketing") was shown quant, cyber and software-apprenticeship roles,
  // each through the bare word "digital". A weak word never counts alone, a role or keyword made only
  // of weak words is one phrase, and target.title_keywords stay exactly as the user wrote them.
  const marketer = withTarget({
    sector: "Marketing",
    roles: ["Marketing intern", "Social media intern", "Brand placement"],
    boost_keywords: ["digital marketing", "social media", "Canva"],
    locations: ["London"],
  });
  const wordsOf = (over) => fieldWords(withTarget({ sector: "Marketing", boost_keywords: [], ...over })).words.join(",");
  t("marketing field words are marketing, social media, brand, canva", fieldWords(marketer).words.join(",") === "marketing,social media,brand,canva", fieldWords(marketer).words.join(","));
  t(`boost "digital marketing" gives "marketing" only`, wordsOf({ roles: ["Marketing intern"], boost_keywords: ["digital marketing"] }) === "marketing", wordsOf({ roles: ["Marketing intern"], boost_keywords: ["digital marketing"] }));
  t(`role "Social media intern" gives the one phrase "social media"`, wordsOf({ roles: ["Social media intern"] }) === "social media", wordsOf({ roles: ["Social media intern"] }));
  t(`sales field words are sales, development ("business" is weak)`, fieldWords(sales).words.join(",") === "sales,development", fieldWords(sales).words.join(","));
  const weakList = [...WEAK_WORDS];
  const weakLeak = weakList.filter((w) => wordsOf({ roles: [`${w} marketing intern`] }) !== "marketing");
  t(`all ${weakList.length} weak words are dropped next to "marketing"`, weakList.length === 21 && weakLeak.length === 0, JSON.stringify(weakLeak));
  t(`title_keywords keep weak words as written ("Digital", "media")`, wordsOf({ title_keywords: ["Digital", "media"] }) === "digital,media", wordsOf({ title_keywords: ["Digital", "media"] }));
  const marketerRe = fieldWordsRe(marketer);
  t(`marketing: the phrase matches "Social Media Intern"`, marketerRe.test("Social Media Intern"), String(marketerRe));
  for (const title of ["Media Product Intern", "Data and Analytics Intern - Customer and Digital", "Data Analytics Intern - Media Handling", "Digital Apprentice - Software Development"])
    t(`marketing: no weak word alone matches "${title}"`, !marketerRe.test(title), String(marketerRe));

  // CS CORE AND APPRENTICESHIPS, non-tech only. Every title from that marketing board, through both
  // paths: an opportunity-list row (fieldOpportunities) and a job-board row (matchJobs, which also
  // needs an internship word, as before). Hand-added rows always stay.
  const BOARD_DROPPED = [
    "Quantitative Analyst Intern - Digital Assets Market Making - High-Frequency Trading",
    "DeFi Quant Research Intern - Digital Assets Market Making",
    "Digital & Technology Solutions Degree Apprenticeship",
    "Digital Apprentice - Software Development",
    "Digital and Technology Solutions Degree Apprentice - Engineering",
    "Digital Degree Apprentice - Software Development Pathway",
    "2027 Summer Internship - Digital (Digital Trust & Cyber Security) - London",
    "Media Product Intern",
    "Data and Analytics Intern - Customer and Digital",
    "Data Analytics Intern - Media Handling",
  ];
  const BOARD_KEPT = ["Data Science & Marketing Effectiveness Intern", "Marketing & Operations Analytics Co-op - Strategy & Analytics"];
  const listed = (title, source = "simplify") => ({ ...inLondon(title), source, kind: "job" });
  const listKeeps = (p, title, source) => fieldOpportunities([listed(title, source)], p).length === 1;
  const bothKeep = (p, title) => listKeeps(p, title) && keeps(p, title);
  const neitherKeeps = (p, title) => !listKeeps(p, title) && !keeps(p, title);
  for (const title of BOARD_DROPPED) t(`marketing drops "${title}" (list and board)`, neitherKeeps(marketer, title), "kept");
  for (const title of BOARD_KEPT) t(`marketing list keeps "${title}"`, listKeeps(marketer, title), "dropped");
  for (const title of ["Data Science & Marketing Effectiveness Intern", "Social Media Intern"]) t(`marketing board keeps "${title}"`, keeps(marketer, title), "dropped");
  t(`marketing: all ${BOARD_DROPPED.length} dropped titles stay when hand-added (jobs/manual.json)`, BOARD_DROPPED.every((title) => listKeeps(marketer, title, "manual")), "dropped");

  // Each rule on its own: profiles whose field words DO match the title, so only that rule can drop it.
  const own = (title_keywords) => withTarget({ sector: "Marketing", roles: ["Marketing intern"], boost_keywords: [], title_keywords, locations: ["London"] });
  const CYBER = "2027 Summer Internship - Digital (Digital Trust & Cyber Security) - London";
  const DTS = "Digital & Technology Solutions Degree Apprenticeship";
  const APPRENTICE_PLACEMENT = "Marketing Apprentice - Industrial Placement";
  t(`title_keywords ["digital"]: CS core drops "${CYBER}" (list and board)`, neitherKeeps(own(["digital"]), CYBER), "kept");
  t(`title_keywords ["digital", "cyber"] keeps it (list and board)`, bothKeep(own(["digital", "cyber"]), CYBER), "dropped");
  t(`title_keywords ["digital"]: apprenticeships drop "${DTS}"`, !listKeeps(own(["digital"]), DTS), "kept");
  t(`title_keywords ["digital", "apprenticeship"] keeps it`, listKeeps(own(["digital", "apprenticeship"]), DTS), "dropped");
  t(`marketing drops "${APPRENTICE_PLACEMENT}" (list and board)`, neitherKeeps(marketer, APPRENTICE_PLACEMENT), "kept");
  const marketerApprentice = { ...marketer, target: { ...marketer.target, roles: [...marketer.target.roles, "Marketing apprentice"] } };
  t(`a role "Marketing apprentice" keeps it (list and board)`, bothKeep(marketerApprentice, APPRENTICE_PLACEMENT), "dropped");
  const boostApprentice = { ...marketer, target: { ...marketer.target, roles: ["Marketing intern"], boost_keywords: ["apprentice"] } };
  const roleApprentice = { ...marketer, target: { ...marketer.target, roles: ["Marketing apprentice"], boost_keywords: [] } };
  // An insight EVENT about apprenticeships is not an apprenticeship: the rule skips kind "event".
  const MS_EVENT = "2027 Insight into Finance Apprenticeships at Morgan Stanley (London)";
  const asKind = (title, kind) => ({ ...inLondon(title), source: "morgan-stanley", kind });
  t(`finance keeps the event "${MS_EVENT}"`, fieldOpportunities([asKind(MS_EVENT, "event")], finance).length === 1, "dropped");
  t(`finance drops the same title as kind "job"`, fieldOpportunities([asKind(MS_EVENT, "job")], finance).length === 0, "kept");
  const softwareOwn = own(["digital", "software"]);
  t(`title_keywords ["digital", "software"]: "Digital Apprentice - Software Development" as kind "job" is still dropped`, fieldOpportunities([{ ...listed("Digital Apprentice - Software Development"), kind: "job" }], softwareOwn).length === 0, "kept");
  t(`...and kept as kind "event" (only the apprentice rule differs)`, fieldOpportunities([{ ...listed("Digital Apprentice - Software Development"), kind: "event" }], softwareOwn).length === 1, "dropped");
  t(`events still follow the CS rule: "Finance Cyber Security Insight Evening" dropped for finance`, fieldOpportunities([asKind("Finance Cyber Security Insight Evening", "event")], finance).length === 0, "kept");
  t(`boost "apprentice" alone does not ask for apprenticeships; a role does`, !listKeeps(boostApprentice, APPRENTICE_PLACEMENT) && listKeeps(roleApprentice, APPRENTICE_PLACEMENT), "wrong");
  t(`board: hand-added CS and apprentice titles stay; the same rows not hand-added drop`, matchJobs([{ ...inLondon(APPRENTICE_PLACEMENT), source: "manual" }, { ...inLondon(CYBER), source: "manual" }], own(["marketing", "digital"])).length === 2 && matchJobs([inLondon(APPRENTICE_PLACEMENT), inLondon(CYBER)], own(["marketing", "digital"])).length === 0, "wrong");

  // Finance: the ticket's check.
  const GMME = "Global Markets Intern - Markets Engineering";
  for (const title of ["Summer Analyst - Markets", "Audit Intern 2027", "Investment Banking Summer Internship"]) t(`finance keeps "${title}" (list and board)`, bothKeep(finance, title), "dropped");
  for (const title of ["Software Engineer Intern", GMME]) t(`finance drops "${title}" (list and board)`, neitherKeeps(finance, title), "kept");
  const financeQuant = { ...finance, target: { ...finance.target, boost_keywords: [...finance.target.boost_keywords, "quant"] } };
  const financeEngineering = { ...finance, target: { ...finance.target, boost_keywords: [...finance.target.boost_keywords, "engineering"] } };
  t(`finance + own field word "engineering" keeps "${GMME}" (list and board)`, bothKeep(financeEngineering, GMME), "dropped");
  t(`finance + field word "quant" keeps "DeFi Quant Research Intern - Digital Assets Market Making" (list and board)`, bothKeep(financeQuant, "DeFi Quant Research Intern - Digital Assets Market Making"), "dropped");
  // Quant is not CS core: a quant research internship that names the field stays for finance.
  const QUANT_RESEARCH = "2027 Quantitative Research Markets Associate Program – Off-Cycle Internship – London";
  t(`finance keeps "${QUANT_RESEARCH}" (list and board)`, bothKeep(finance, QUANT_RESEARCH), "dropped");
  t(`"quant" and "quantitative" are not CS core (finance field words do not unlock anything)`, !fieldNarrow(finance).drops("Quant Research Intern") && !fieldNarrow(finance).drops("Quantitative Analyst Intern") && fieldNarrow(finance).drops("Software Engineer Intern"), "dropped");
  // ...and marketing still drops both Keyrock quant titles, now through the field filter alone.
  for (const title of BOARD_DROPPED.slice(0, 2))
    t(`marketing drops "${title}" by the field filter (no field word), not by CS core`, !marketerRe.test(title) && !fieldNarrow(marketer).drops(title) && neitherKeeps(marketer, title), "kept");
  t(`finance: a hand-added "${GMME}" stays on the board`, matchJobs([{ ...inLondon(GMME), source: "manual" }], finance).length === 1, "dropped");

  // Tech: unchanged, on these very titles too.
  t("a tech profile gets no extra rule (fieldNarrow is null)", fieldNarrow(ex) === null, JSON.stringify(fieldNarrow(ex)));
  const NEW_TITLES = [...BOARD_DROPPED, ...BOARD_KEPT, GMME, APPRENTICE_PLACEMENT, "Social Media Intern", "Software Engineer Intern"];
  const newRows = NEW_TITLES.flatMap((title) => [inLondon(title), listed(title), { ...inLondon(title), location: "Lisbon, Portugal" }]);
  const oldNew = newRows
    .filter((j) => INTERN_RE.test(j.title) && !EXCLUDE_RE.test(j.title))
    .filter((j) => TECH_RE.test(j.title))
    .filter((j) => inRange(j.location, ex) || inRange(j.title, ex));
  t(`the example profile keeps exactly today's titles from these rows (${oldNew.length} of ${newRows.length})`, oldNew.length > 0 && JSON.stringify(matchJobs(newRows, ex)) === JSON.stringify(oldNew), `${matchJobs(newRows, ex).length} vs ${oldNew.length}`);
  t(`tech example still keeps "DeFi Quant Research Intern - Digital Assets Market Making" and "Software Engineer Intern"`, keeps(ex, "DeFi Quant Research Intern - Digital Assets Market Making") && keeps(ex, "Software Engineer Intern"), "dropped");
  const listedRows = NEW_TITLES.map((title) => listed(title));
  t("a tech profile's opportunity rows for these titles are the very same array", fieldOpportunities(listedRows, ex) === listedRows, "filtered");

  // The board is cleared once: a finance board stored before these rules has the same field words.
  const marketerFp = fieldFingerprint(marketer);
  t(`a non-tech fingerprint names both switches: "${marketerFp}"`, marketerFp === `non-tech|${fieldWordsRe(marketer).source}|cs:dropped|apprentice:dropped`, marketerFp);
  const storedBefore = { field_fingerprint: `non-tech|${fieldWordsRe(finance).source}`, jobs: [{ url: "https://example.com/gmme", title: GMME }] };
  t("a finance board stored before these rules is cleared", boardForField(storedBefore, fieldFingerprint(finance)).cleared === true, fieldFingerprint(finance));
  t("the same words with apprenticeships asked for give another fingerprint", fieldWords(boostApprentice).words.join() === fieldWords(roleApprentice).words.join() && fieldFingerprint(boostApprentice) !== fieldFingerprint(roleApprentice), fieldFingerprint(roleApprentice));
  t("financeEngineering's fingerprint says CS titles are kept", fieldFingerprint(financeEngineering).endsWith("|cs:kept|apprentice:dropped"), fieldFingerprint(financeEngineering));

  // WHICH EMPLOYER LIST: jobs/sources.json when it exists, else the shipped example for the sector.
  const none = { root: path.join(PROJECT_ROOT, "no-such-dir"), exists: () => false };
  t("finance with no jobs/sources.json uses sources.general.example.json", sourcesFileFor(finance, none) === SOURCES_GENERAL_EXAMPLE, sourcesFileFor(finance, none));
  t("marketing with no jobs/sources.json uses sources.general.example.json", sourcesFileFor(marketing, none) === SOURCES_GENERAL_EXAMPLE, sourcesFileFor(marketing, none));
  t("the tech example with no jobs/sources.json keeps sources.example.json", sourcesFileFor(ex, none) === SOURCES_EXAMPLE, sourcesFileFor(ex, none));
  t("an existing jobs/sources.json wins for every sector", [finance, marketing, ex].every((p) => sourcesFileFor(p, { root: "r", exists: () => true }) === path.join("r", "jobs", "sources.json")), "ignored");
  t("main() picks the file with sourcesFileFor", /sourcesFileFor\(profile/.test(mainSrc), "not wired");
  // ...and the shipped general list is well formed: 10-20 board rows the adapters know, dated notes.
  const general = JSON.parse(fs.readFileSync(SOURCES_GENERAL_EXAMPLE, "utf8"));
  const tier1 = general.tier1 || [];
  t(`general list has 10-20 tier1 rows (${tier1.length})`, tier1.length >= 10 && tier1.length <= 20, String(tier1.length));
  t("every general tier1 row names a known ATS and a slug", tier1.every((r) => ADAPTERS[r.ats] && r.slug && r.company), JSON.stringify(tier1.filter((r) => !ADAPTERS[r.ats] || !r.slug)));
  t("no employer appears twice in the general list", new Set(tier1.map((r) => r.company)).size === tier1.length, "duplicate");
  const t2 = general.tier2_browser_required || [];
  // THE DASHBOARD HEADER names the intake once. A setup answer that already held the year printed
  // "for Season: summer · year: 2027 2027".
  const doubled = withTarget({ timing: { ...ex.target.timing, intake_season: "Season: summer · year: 2027", intake_year: 2027 } });
  const label = intakeLabel(doubled);
  t(`header names the year once: "${label}"`, label.split("2027").length === 2, label);
  t(`header for "summer 2027" + 2027 is "Summer 2027"`, intakeLabel(withTarget({ timing: { intake_season: "summer 2027", intake_year: 2027 } })) === "Summer 2027", intakeLabel(withTarget({ timing: { intake_season: "summer 2027", intake_year: 2027 } })));
  t(`header for the example is unchanged: "${intakeLabel(ex)}"`, intakeLabel(ex) === `Summer ${ex.target.timing.intake_year}`, intakeLabel(ex));
  t(`every tier2 row has name, https url, a dated measurement and handling (${t2.length})`,
    t2.length > 0 && t2.every((r) => r.name && /^https:\/\//.test(r.url) && Object.keys(r).some((k) => /^measured_\d{4}_\d{2}_\d{2}$/.test(k)) && r.handling), "malformed");

  // FIX (a): AN EMPTY SECTOR. The owner's finance role-play left target.sector blank; isTechSector
  // read blank as tech, so TECH_RE filtered the board. Now the roles decide. The example stays tech.
  const financeBlank = withTarget({ sector: "", roles: finance.target.roles, boost_keywords: finance.target.boost_keywords, locations: finance.target.locations });
  t(`empty sector + roles ${JSON.stringify(financeBlank.target.roles)} is not tech`, isTechSector(financeBlank) === false, "read as tech");
  t("empty sector + finance roles: finance field words, not TECH_RE", fieldWordsRe(financeBlank) !== TECH_RE && fieldWords(financeBlank).words.join(",") === fieldWords(finance).words.join(","), String(fieldWordsRe(financeBlank)));
  t(`empty sector + finance roles keeps "Audit Intern 2027" and drops "Software Engineer Intern"`, keeps(financeBlank, "Audit Intern 2027") && !keeps(financeBlank, "Software Engineer Intern"), "wrong");
  t("empty sector + finance roles uses sources.general.example.json", sourcesFileFor(financeBlank, none) === SOURCES_GENERAL_EXAMPLE, sourcesFileFor(financeBlank, none));
  t("missing sector (not just empty) + finance roles is not tech", isTechSector(withTarget({ sector: undefined, roles: finance.target.roles })) === false, "read as tech");
  t("empty sector + no roles keeps the tech default", isTechSector(withTarget({ sector: "", roles: [] })) && fieldWordsRe(withTarget({ sector: "", roles: [] })) === TECH_RE, "not tech");
  t("empty sector + one tech role among finance roles stays tech", isTechSector(withTarget({ sector: "", roles: [...finance.target.roles, "Data analyst intern"] })), "not tech");
  t("the example profile is still tech, with TECH_RE", isTechSector(ex) && fieldWordsRe(ex) === TECH_RE, "not tech");
  t("the example's roles with an empty sector are still tech", isTechSector(withTarget({ sector: "" })) && fieldWordsRe(withTarget({ sector: "" })) === TECH_RE, "not tech");

  // FIX (b): A STALE BOARD. found.json records the field filter's fingerprint; a different one clears
  // the stored rows, the same one keeps today's merge. A board with no fingerprint counts as tech.
  const fpTech = fieldFingerprint(ex);
  const fpFin = fieldFingerprint(financeBlank);
  const oldRows = [{ url: "https://example.com/swe", title: "Software Engineer Intern" }, { url: "https://example.com/data", title: "Data Engineering Intern" }];
  t("the example's fingerprint is the legacy (tech) fingerprint", fpTech === LEGACY_FINGERPRINT && fpTech.startsWith("tech|"), fpTech);
  t("finance's fingerprint differs from the example's", fpFin !== fpTech && fpFin.startsWith("non-tech|"), fpFin);
  t("fingerprint follows title_keywords too", fieldFingerprint(financeOwn) !== fpFin, fieldFingerprint(financeOwn));
  const changedBoard = boardForField({ field_fingerprint: fpTech, jobs: oldRows }, fpFin);
  t("a changed fingerprint clears the stored rows", changedBoard.cleared === true && changedBoard.jobs.length === 0, JSON.stringify(changedBoard));
  const sameBoard = boardForField({ field_fingerprint: fpFin, jobs: oldRows }, fpFin);
  t("the same fingerprint keeps every stored row (today's merge)", sameBoard.cleared === false && sameBoard.jobs === oldRows, JSON.stringify(sameBoard));
  t("a board with no fingerprint + the tech example keeps its rows", boardForField({ jobs: oldRows }, fpTech).jobs === oldRows, "cleared");
  t("a board with no fingerprint + finance is cleared", boardForField({ jobs: oldRows }, fpFin).cleared === true, "kept");
  t("no stored rows: nothing cleared, nothing said", boardForField({ jobs: [] }, fpFin).cleared === false && boardForField(undefined, fpFin).jobs.length === 0, "said");
  t("main() checks the board with boardForField and prints the line", /boardForField\(stored, fingerprint\)/.test(mainSrc) && mainSrc.includes("your field changed since the last run — previous board cleared"), "not wired");
  t("main() merges into the checked board, not the stored one", /const prev = \{ \.\.\.stored, jobs: board\.jobs \}/.test(mainSrc) && /const merged = \[\.\.\.prev\.jobs\]/.test(mainSrc), "not wired");
  t("main() writes the fingerprint into found.json", /field_fingerprint: fingerprint/.test(mainSrc), "not wired");

  // JOB APIS (scripts/sources-api.mjs). A stubbed fetch throughout: no network, no real key. The
  // fake keys below must never appear in anything the tool prints, returns or stores.
  const FAKE = {
    ADZUNA_APP_ID: "fakeid-7f3a91",
    ADZUNA_APP_KEY: "fakekey-c0ffee-0123456789",
    REED_API_KEY: "fake-reed-1b2c3d4e-0000-4f00-9abc-def012345678",
    APIFY_TOKEN: "apify_api_FAKEfakeFAKEfake0123456789",
  };
  // ...nor their Basic-auth form (Reed sends base64("key:") in a header).
  const FAKE_VALUES = Object.values(FAKE).flatMap((v) => [v, Buffer.from(`${v}:`).toString("base64")]);
  const leaks = (...things) => FAKE_VALUES.filter((v) => things.some((x) => JSON.stringify(x ?? "").includes(v)));
  const stubFetch = (respond) => {
    const calls = [];
    const f = async (url, init) => {
      calls.push({ url, init });
      return respond(url, init, calls.length);
    };
    f.calls = calls;
    return f;
  };
  const answer = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const runApi = async (env, fetchImpl, only, profile = financeBlank, extra = {}) => {
    const out = [];
    const res = await fetchApiSources(profile, { env, fetchImpl, log: (m) => out.push(m), pauseMs: 0, sources: API_SOURCES.filter((s) => only.includes(s.name)), ...extra });
    return { ...res, out: out.join("\n") };
  };
  const src = (name) => API_SOURCES.find((s) => s.name === name);
  const q0 = { role: "Audit intern", location: "Edinburgh" };
  const showRequest = (name, env) => {
    const req = src(name).request(q0, env);
    const auth = Object.keys(req.headers || {}).some((h) => h.toLowerCase() === "authorization");
    return { req, auth, line: `${req.method} ${redactUrl(req.url)} · auth header: ${auth ? "yes" : "no"}` };
  };

  // The searches: target.roles × target.locations, capped at 10.
  const plan = apiQueries(financeBlank);
  t(`queries are roles × locations (${plan.queries.length} = 3 × 2)`, plan.queries.length === 6 && plan.total === 6 && plan.queries[0].role === "Investment banking summer analyst" && plan.queries[1].location === "London", JSON.stringify(plan.queries));
  const wide = withTarget({ sector: "Finance", roles: ["Audit intern", "Tax intern", "Finance placement", "Banking intern"], locations: ["London", "Edinburgh", "Leeds"] });
  t(`queries are capped at ${MAX_QUERIES} (4 × 3 = 12 asked)`, apiQueries(wide).queries.length === MAX_QUERIES && apiQueries(wide).total === 12, JSON.stringify(apiQueries(wide)));
  t("no roles: no queries", apiQueries(withTarget({ roles: [] })).queries.length === 0, "queries");
  t("redactUrl drops the query string", redactUrl("https://x.test/a?app_key=s3cret&b=1") === "https://x.test/a?[query redacted]" && redactUrl("https://x.test/a") === "https://x.test/a", redactUrl("https://x.test/a?app_key=s3cret"));
  t("scrub replaces every copy of a secret", scrub("k=abcdef and abcdef", ["abcdef"]) === "k=[redacted] and [redacted]", scrub("k=abcdef and abcdef", ["abcdef"]));

  // ADZUNA. The fixture is the documented shape (results[] of Job: id, title, description, created,
  // redirect_url, location.display_name/area, company.display_name, category, contract_time).
  const ADZUNA_FIXTURE = {
    count: 3,
    mean: 24000,
    results: [
      { id: "4100000001", title: "Audit Intern 2027", description: "Join our <strong>audit</strong> team for a ten-week summer internship.", created: "2026-11-20T09:00:00Z", redirect_url: "https://www.adzuna.co.uk/jobs/land/ad/4100000001?se=abc&v=1", adref: "eyJhbGci", location: { display_name: "Edinburgh, Scotland", area: ["UK", "Scotland", "Edinburgh"] }, company: { display_name: "Example Audit LLP" }, category: { tag: "accounting-finance-jobs", label: "Accounting & Finance Jobs" }, contract_time: "full_time", contract_type: "contract" },
      { id: "4100000002", title: "Senior Financial Analyst", description: "Five years' experience in FP&A.", created: "2026-11-19T09:00:00Z", redirect_url: "https://www.adzuna.co.uk/jobs/land/ad/4100000002?se=abc&v=1", location: { display_name: "London, UK", area: ["UK", "London"] }, company: { display_name: "Example Bank" }, category: { tag: "accounting-finance-jobs", label: "Accounting & Finance Jobs" }, contract_time: "full_time", contract_type: "permanent" },
      { id: "4100000003", title: "Investment Banking Summer Internship", description: "Summer 2027.", created: "2026-11-18T09:00:00Z", redirect_url: `https://www.adzuna.co.uk/jobs/land/ad/4100000003?a=${FAKE.ADZUNA_APP_ID}`, location: { area: ["UK", "London"] }, company: { display_name: "Example Capital" }, category: { tag: "accounting-finance-jobs", label: "Accounting & Finance Jobs" } },
    ],
  };
  const adz = src("Adzuna").parse(ADZUNA_FIXTURE);
  t(`Adzuna: the documented answer gives ${adz.length} rows`, adz.length === 3, String(adz.length));
  t("Adzuna: a row has the job-board shape",
    JSON.stringify(adz[0]) === JSON.stringify({ source: "adzuna", kind: "job", company: "Example Audit LLP", title: "Audit Intern 2027", location: "Edinburgh, Scotland", url: "https://www.adzuna.co.uk/jobs/land/ad/4100000001?se=abc&v=1", posted: "2026-11-20T09:00:00Z", description: "Join our audit team for a ten-week summer internship." }),
    JSON.stringify(adz[0]));
  t("Adzuna: location falls back to the area list", adz[2].location === "UK, London", adz[2].location);
  t("Adzuna: an unexpected answer gives no rows and does not throw", [null, {}, { results: null }, []].every((d) => Array.isArray(src("Adzuna").parse(d)) && src("Adzuna").parse(d).length === 0), "threw or rows");
  const adzReq = showRequest("Adzuna", FAKE);
  const adzUrl = new URL(adzReq.req.url);
  t(`Adzuna request: ${adzReq.line}`,
    adzReq.req.method === "GET" && adzUrl.origin + adzUrl.pathname === "https://api.adzuna.com/v1/api/jobs/gb/search/1" &&
      adzUrl.searchParams.get("app_id") === FAKE.ADZUNA_APP_ID && adzUrl.searchParams.get("app_key") === FAKE.ADZUNA_APP_KEY &&
      adzUrl.searchParams.get("what") === "Audit intern" && adzUrl.searchParams.get("where") === "Edinburgh" &&
      Number(adzUrl.searchParams.get("results_per_page")) <= 50 && !adzReq.auth && leaks(adzReq.line).length === 0,
    adzReq.req.url.replace(FAKE.ADZUNA_APP_KEY, "KEY"));

  // No key, no call — and a half-set key is no key.
  for (const [label, env] of [["no keys at all", {}], ["only ADZUNA_APP_ID", { ADZUNA_APP_ID: FAKE.ADZUNA_APP_ID }], ["keys set to spaces", { ADZUNA_APP_ID: " ", ADZUNA_APP_KEY: " " }]]) {
    const f = stubFetch(() => answer(ADZUNA_FIXTURE));
    const r = await runApi(env, f, ["Adzuna"]);
    t(`Adzuna, ${label}: no fetch, the "not configured" line, not a failure`,
      f.calls.length === 0 && r.out.includes("Adzuna: not configured — set ADZUNA_APP_ID and ADZUNA_APP_KEY (free key: developer.adzuna.com/signup)") && r.errors.length === 0 && r.rows.length === 0,
      `${f.calls.length} calls; ${r.out}; ${r.errors}`);
  }
  // A refused key is a FAILED source; the key is in no output, no error, no row.
  for (const status of [401, 403, 410]) {
    const f = stubFetch(() => answer({ exception: "AUTH_FAIL", display: "Authorisation failed" }, status));
    const r = await runApi(FAKE, f, ["Adzuna"]);
    t(`Adzuna, HTTP ${status}: "Adzuna: key rejected (HTTP ${status})", one call, no key printed`,
      r.errors.length === 1 && r.errors[0] === `Adzuna: key rejected (HTTP ${status})` && f.calls.length === 1 && r.out.includes(`FAILED — key rejected (HTTP ${status})`) && leaks(r.out, r.errors, r.rows).length === 0,
      `${JSON.stringify(r.errors)} ${f.calls.length} calls leaks=${leaks(r.out, r.errors, r.rows).length}`);
  }
  {
    const f = stubFetch(() => {
      throw new Error(`connect ECONNREFUSED https://api.adzuna.com/v1/api/jobs/gb/search/1?app_id=${FAKE.ADZUNA_APP_ID}&app_key=${FAKE.ADZUNA_APP_KEY}`);
    });
    const r = await runApi(FAKE, f, ["Adzuna"]);
    t("Adzuna: a network error that quotes the key is scrubbed before it is printed", r.errors.length === 1 && r.errors[0].includes("[redacted]") && leaks(r.out, r.errors).length === 0, JSON.stringify(r.errors).replaceAll(FAKE.ADZUNA_APP_KEY, "KEY"));
  }
  {
    const f = stubFetch((url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")))));
    const started = Date.now();
    let got;
    try {
      await fetchWithTimeout(f, "https://x.test/", {}, 50);
      got = "resolved";
    } catch (e) {
      got = e.message;
    }
    t("a hung request is aborted by its timeout (the timer fires)", /^timed out after/.test(got) && Date.now() - started < 2000, got);
  }
  {
    const b64 = Buffer.from(`${FAKE.REED_API_KEY}:`).toString("base64");
    const f = stubFetch(() => {
      throw new Error(`socket hang up (request had authorization: Basic ${b64})`);
    });
    const r = await runApi(FAKE, f, ["Reed"]);
    t("Reed: an error that quotes the Basic-auth header is scrubbed before it is printed", r.errors.length === 1 && !r.errors[0].includes(b64) && !r.out.includes(b64) && r.errors[0].includes("[redacted]"), JSON.stringify(r.errors).replaceAll(b64, "B64"));
  }
  t("every API source has a timeout of 5 minutes or less", API_SOURCES.every((s) => s.timeoutMs > 0 && s.timeoutMs <= 300000), JSON.stringify(API_SOURCES.map((s) => [s.name, s.timeoutMs])));
  // A working key: every query is asked, duplicates collapse, the key leaves no trace in the rows.
  const adzFetch = stubFetch(() => answer(ADZUNA_FIXTURE));
  const adzRun = await runApi(FAKE, adzFetch, ["Adzuna"]);
  t(`Adzuna, working key: ${adzFetch.calls.length} calls for 6 queries, 3 rows after de-duplication, the count printed`,
    adzFetch.calls.length === 6 && adzRun.rows.length === 3 && adzRun.errors.length === 0 && adzRun.out.includes("6 queries (3 role(s) × 2 location(s))") && adzRun.out.includes("3 postings"),
    `${adzFetch.calls.length} calls, ${adzRun.rows.length} rows; ${adzRun.out}`);
  t("Adzuna: a key inside a result URL is scrubbed before the row is stored", leaks(adzRun.rows).length === 0 && adzRun.rows[2]?.url.endsWith("?a=[redacted]"), String(adzRun.rows[2]?.url).replace(FAKE.ADZUNA_APP_ID, "ID"));
  {
    const f = stubFetch(() => answer(ADZUNA_FIXTURE));
    const r = await runApi(FAKE, f, ["Adzuna"], wide);
    t(`Adzuna: 12 searches asked, ${f.calls.length} made, "capped at 10" printed`, f.calls.length === 10 && r.out.includes("12, capped at 10"), `${f.calls.length}; ${r.out}`);
  }
  {
    const f = stubFetch(() => answer(ADZUNA_FIXTURE));
    const r = await runApi(FAKE, f, ["Adzuna"], financeBlank, { known: new Set([normalizeUrl(ADZUNA_FIXTURE.results[0].redirect_url)]) });
    t("Adzuna: a posting already on this run's board is not added twice", r.rows.length === 2 && !r.rows.some((x) => x.title === "Audit Intern 2027"), JSON.stringify(r.rows.map((x) => x.title)));
  }
  {
    let n = 0;
    const f = stubFetch(() => (++n === 1 ? answer(ADZUNA_FIXTURE) : answer({}, 429)));
    const r = await runApi(FAKE, f, ["Adzuna"]);
    t("Adzuna: HTTP 429 mid-run stops the source, keeps what it found, and reports it", f.calls.length === 2 && r.rows.length === 3 && r.errors[0] === "Adzuna: HTTP 429" && r.out.includes("after 1 of 6 queries (3 postings kept)"), `${f.calls.length} ${JSON.stringify(r.errors)} ${r.out}`);
  }
  // THE SAME FILTERS: an API row is a job-board row. A full-time title is dropped, a field internship
  // kept — by matchJobs, the function main() runs over every job-board row.
  const adzKept = matchJobs(adzRun.rows, financeBlank).map((j) => j.title);
  t(`Adzuna rows through matchJobs: "Senior Financial Analyst" dropped, the internships kept`, adzKept.join("|") === "Audit Intern 2027|Investment Banking Summer Internship", JSON.stringify(adzKept));
  t("Adzuna rows through matchJobs for the tech example: no finance internship kept", matchJobs(adzRun.rows, ex).length === 0, JSON.stringify(matchJobs(adzRun.rows, ex).map((j) => j.title)));
  const apiAt = mainSrc.indexOf("all.push(...api.rows)");
  t("main() adds the API rows to the job-board rows before matchJobs", /fetchApiSources\(profile/.test(mainSrc) && apiAt > 0 && apiAt < mainSrc.indexOf("matchJobs(all, profile)"), "not wired");
  t("main() lists a failed API source with the other failures", /errors\.push\(\.\.\.api\.errors\)/.test(mainSrc), "not wired");

  // REED. Its page lists result fields by display name only (Job Id, Employer Name, Job Title,
  // Description, Location Name, ...); the fixture spells them in the page's own camelCase. The page
  // names no wrapper and no link field, so the fixture's wrapper and link keys are deliberately
  // arbitrary: the parser must not depend on them.
  const reedJob = (id, title, location, extra = {}) => ({ jobId: id, employerId: 900 + id % 10, employerName: `Example Employer ${id % 10}`, employerProfileId: null, jobTitle: title, locationName: location, minimumSalary: 22000, maximumSalary: 24000, ...extra });
  const REED_JOBS = [
    reedJob(51000001, "Audit Intern 2027", "Edinburgh", { jobDescription: "A ten-week audit internship.", anyLinkKey: "https://www.reed.co.uk/jobs/audit-intern-2027/51000001" }),
    reedJob(51000002, "Senior Accountant", "London", { description: "Qualified ACA or ACCA.", anyLinkKey: "https://www.reed.co.uk/jobs/senior-accountant/51000002" }),
    reedJob(51000003, "Finance Placement Year 2027", "London"), // no link: looked up, it passes the filter
    reedJob(51000004, "Graduate Accountant", "Leeds"), // no link, and the filter drops it: never looked up
  ];
  const REED_FIXTURE = { someName: 4, otherPlaces: ["London, Ontario"], anyListName: REED_JOBS };
  const REED_DETAILS = { jobId: 51000003, jobTitle: "Finance Placement Year 2027", employerName: "Example Employer 3", anyExternal: "https://careers.example.com/apply/3", anyReedLink: "https://www.reed.co.uk/jobs/finance-placement-year-2027/51000003" };
  const reedRows = src("Reed").parse(REED_FIXTURE);
  t(`Reed: the documented answer gives ${reedRows.length} rows, wrapped or bare`, reedRows.length === 4 && JSON.stringify(src("Reed").parse(REED_JOBS)) === JSON.stringify(reedRows), String(reedRows.length));
  t("Reed: a row has the job-board shape",
    JSON.stringify(reedRows[0]) === JSON.stringify({ source: "reed", kind: "job", company: "Example Employer 1", title: "Audit Intern 2027", location: "Edinburgh", url: "https://www.reed.co.uk/jobs/audit-intern-2027/51000001", posted: null, description: "A ten-week audit internship.", _id: "51000001" }),
    JSON.stringify(reedRows[0]));
  t("Reed: either documented description name is read", reedRows[1].description === "Qualified ACA or ACCA.", String(reedRows[1].description));
  t("Reed: an unexpected answer gives no rows and does not throw", [null, {}, { a: [1, 2] }, [], "x"].every((d) => Array.isArray(src("Reed").parse(d)) && src("Reed").parse(d).length === 0), "threw or rows");
  t("Reed: the link naming the job id wins over another link", reedLink({ jobId: 7, a: "https://www.reed.co.uk/recruiter/x", b: "https://www.reed.co.uk/jobs/y/7" }) === "https://www.reed.co.uk/jobs/y/7" && reedLink({ a: "https://evil.example/reed.co.uk/" }) === "", "wrong link");
  const reedReq = showRequest("Reed", FAKE);
  const reedUrl = new URL(reedReq.req.url);
  const reedAuth = Buffer.from(String(reedReq.req.headers.authorization).replace(/^Basic /, ""), "base64").toString();
  t(`Reed request: ${reedReq.line}`,
    reedReq.req.method === "GET" && reedUrl.origin + reedUrl.pathname === "https://www.reed.co.uk/api/1.0/search" &&
      reedUrl.searchParams.get("keywords") === "Audit intern" && reedUrl.searchParams.get("locationName") === "Edinburgh" &&
      Number(reedUrl.searchParams.get("resultsToTake")) <= 100 && reedReq.auth && reedAuth === `${FAKE.REED_API_KEY}:` &&
      !reedReq.req.url.includes(FAKE.REED_API_KEY) && leaks(reedReq.line).length === 0,
    reedReq.line);
  t("Reed: a job id that is not a plain number is never put in a lookup path", src("Reed").lookup.request({ _id: "../../users" }, FAKE) === null && src("Reed").lookup.request({ _id: "51000003" }, FAKE).url === "https://www.reed.co.uk/api/1.0/jobs/51000003", "unsafe");
  {
    const f = stubFetch(() => answer(REED_FIXTURE));
    const r = await runApi({ ADZUNA_APP_ID: FAKE.ADZUNA_APP_ID }, f, ["Reed"]);
    t(`Reed, no key: no fetch, the "not configured" line, not a failure`,
      f.calls.length === 0 && r.out.includes("Reed: not configured — set REED_API_KEY (free key: www.reed.co.uk/developers/jobseeker)") && r.errors.length === 0 && r.rows.length === 0,
      `${f.calls.length} calls; ${r.out}`);
  }
  for (const status of [401, 403]) {
    const f = stubFetch(() => answer({ message: "Unauthorized" }, status));
    const r = await runApi(FAKE, f, ["Reed"]);
    t(`Reed, HTTP ${status}: "Reed: key rejected (HTTP ${status})", one call, no key printed`,
      r.errors.length === 1 && r.errors[0] === `Reed: key rejected (HTTP ${status})` && f.calls.length === 1 && leaks(r.out, r.errors, r.rows).length === 0,
      `${JSON.stringify(r.errors)} ${f.calls.length} calls leaks=${leaks(r.out, r.errors, r.rows).length}`);
  }
  const reedFetch = stubFetch((url) => answer(url.includes("/api/1.0/jobs/") ? REED_DETAILS : REED_FIXTURE));
  const reedRun = await runApi(FAKE, reedFetch, ["Reed"], financeBlank, { keep: (rows) => matchJobs(rows, financeBlank) });
  const lookups = reedFetch.calls.filter((c) => c.url.includes("/api/1.0/jobs/"));
  t(`Reed, working key: 6 searches + ${lookups.length} link lookup (only the row the filter keeps), 3 rows, counts printed`,
    reedFetch.calls.length === 7 && lookups.length === 1 && lookups[0].url.endsWith("/51000003") && reedRun.rows.length === 3 && reedRun.errors.length === 0 &&
      reedRun.out.includes("3 postings, 1 link(s) looked up, 1 without a link skipped"),
    `${reedFetch.calls.length} calls; ${reedRun.out}`);
  t("Reed: the looked-up row carries its reed.co.uk link, and no internal field", reedRun.rows.find((x) => x.title === "Finance Placement Year 2027")?.url === REED_DETAILS.anyReedLink && reedRun.rows.every((x) => !("_id" in x)), JSON.stringify(reedRun.rows));
  t("Reed: every request sent Basic auth, and the key is in no URL, output or row",
    reedFetch.calls.every((c) => /^Basic /.test(c.init.headers.authorization) && !c.url.includes(FAKE.REED_API_KEY)) && leaks(reedRun.out, reedRun.errors, reedRun.rows).length === 0, "leak");
  const reedKept = matchJobs(reedRun.rows, financeBlank).map((j) => j.title);
  t(`Reed rows through matchJobs: "Senior Accountant" dropped, the internship and placement kept`, reedKept.join("|") === "Audit Intern 2027|Finance Placement Year 2027", JSON.stringify(reedKept));
  t("main() passes matchJobs as the lookup filter", /keep: \(rows\) => matchJobs\(rows, profile\)/.test(mainSrc), "not wired");

  // APIFY (opt-in). The fixtures are the output items shown in each actor's README (default build,
  // read 2026-11-26), trimmed to the fields read.
  const LINKEDIN_FIXTURE = [
    { id: "4300000001", url: "https://www.linkedin.com/jobs/view/audit-intern-summer-2027-at-example-audit-4300000001", title: "Audit Intern - Summer 2027", location: "Edinburgh, Scotland, United Kingdom", companyName: "Example Audit LLP", contractType: "Internship", postedTimeAgo: "2 days ago", postedDate: "2026-11-24", description: "Our audit internship runs for ten weeks." },
    { id: "4300000002", url: "https://www.linkedin.com/jobs/view/senior-audit-manager-at-example-bank-4300000002", title: "Senior Audit Manager", location: "London, England, United Kingdom", companyName: "Example Bank", contractType: "Full-time", postedDate: "2026-11-23", description: "Lead audit engagements." },
  ];
  const INDEED_FIXTURE = [
    { key: "a1b2c3d4e5f60001", url: "https://uk.indeed.com/viewjob?jk=a1b2c3d4e5f60001", title: "Finance Intern 2027", jobUrl: "https://careers.example.com/finance-intern-2027", datePublished: "2026-11-21T05:00:00.000Z", location: { countryName: "United Kingdom", countryCode: "GB", city: "London" }, employer: { name: "Example Capital" }, description: { text: "A summer finance internship.", html: "<p>A summer finance internship.</p>" } },
    { key: "a1b2c3d4e5f60002", url: "https://uk.indeed.com/viewjob?jk=a1b2c3d4e5f60002", title: "Financial Controller", jobUrl: null, datePublished: "2026-11-20T05:00:00.000Z", location: { countryName: "United Kingdom", countryCode: "GB", city: "London" }, employer: { name: "Example Bank" }, description: { text: "Ten years' experience." } },
  ];
  const li = src("Apify LinkedIn").parse(LINKEDIN_FIXTURE);
  const ind = src("Apify Indeed").parse(INDEED_FIXTURE);
  t("Apify LinkedIn: a README output item becomes a job-board row",
    li.length === 2 && JSON.stringify(li[0]) === JSON.stringify({ source: "apify-linkedin", kind: "job", company: "Example Audit LLP", title: "Audit Intern - Summer 2027", location: "Edinburgh, Scotland, United Kingdom", url: LINKEDIN_FIXTURE[0].url, posted: "2026-11-24", description: "Our audit internship runs for ten weeks." }),
    JSON.stringify(li[0]));
  t("Apify Indeed: a README output item becomes a job-board row (employer link first, Indeed's when none)",
    ind.length === 2 && JSON.stringify(ind[0]) === JSON.stringify({ source: "apify-indeed", kind: "job", company: "Example Capital", title: "Finance Intern 2027", location: "London, United Kingdom", url: "https://careers.example.com/finance-intern-2027", posted: "2026-11-21T05:00:00.000Z", description: "A summer finance internship." }) && ind[1].url === INDEED_FIXTURE[1].url,
    JSON.stringify(ind));
  t("Apify: an unexpected answer gives no rows and does not throw", [null, {}, { error: { type: "x" } }, [null, 3]].every((d) => src("Apify LinkedIn").parse(d).length === 0 && src("Apify Indeed").parse(d).length === 0), "threw or rows");
  for (const [name, actor, inputKeys] of [["Apify LinkedIn", "valig~linkedin-jobs-scraper", ["keywords", "location", "limit"]], ["Apify Indeed", "valig~indeed-jobs-scraper", ["country", "title", "location", "limit"]]]) {
    const r = showRequest(name, FAKE);
    const u = new URL(r.req.url);
    const body = JSON.parse(r.req.body);
    t(`${name} request: ${r.line} · input ${JSON.stringify(body)}`,
      r.req.method === "POST" && u.origin + u.pathname === `https://api.apify.com/v2/actors/${actor}/run-sync-get-dataset-items` &&
        Number(u.searchParams.get("maxItems")) <= 50 && Number(u.searchParams.get("timeout")) > 0 && !u.searchParams.has("token") &&
        r.req.headers.authorization === `Bearer ${FAKE.APIFY_TOKEN}` && !r.req.url.includes(FAKE.APIFY_TOKEN) &&
        Object.keys(body).join() === inputKeys.join() && body.limit <= 50 && (body.keywords || body.title) === "Audit intern" && body.location === "Edinburgh" && leaks(r.line).length === 0,
      r.req.url);
  }
  t("Apify Indeed asks for the UK", JSON.parse(showRequest("Apify Indeed", FAKE).req.body).country === "uk", "not uk");
  {
    const env = { ...FAKE, CAREER_AGENT_APIFY_LINKEDIN_ACTOR: "someone/other-jobs", CAREER_AGENT_APIFY_INDEED_ACTOR: "someone~other-indeed" };
    t("Apify: the two actor overrides are used (\"user/name\" read as \"user~name\")",
      src("Apify LinkedIn").request(q0, env).url.includes("/actors/someone~other-jobs/") && src("Apify Indeed").request(q0, env).url.includes("/actors/someone~other-indeed/"), src("Apify LinkedIn").request(q0, env).url);
    const f = stubFetch(() => answer(LINKEDIN_FIXTURE, 201));
    const r = await runApi({ ...FAKE, CAREER_AGENT_APIFY_LINKEDIN_ACTOR: "../../v2/users/me" }, f, ["Apify LinkedIn"]);
    t("Apify: an actor override that is not an actor id fails the source, with no call", f.calls.length === 0 && r.errors[0] === "Apify LinkedIn: CAREER_AGENT_APIFY_LINKEDIN_ACTOR is not an actor id like username~actor-name", `${f.calls.length} ${JSON.stringify(r.errors)}`);
  }
  {
    const f = stubFetch(() => answer(LINKEDIN_FIXTURE, 201));
    const r = await runApi({ ADZUNA_APP_ID: FAKE.ADZUNA_APP_ID, REED_API_KEY: FAKE.REED_API_KEY }, f, ["Apify LinkedIn", "Apify Indeed"]);
    const lines = r.out.split("\n").filter((x) => x.includes("Apify (LinkedIn, Indeed): not configured — opt-in only: set APIFY_TOKEN"));
    t("Apify, no token: no fetch, one \"not configured\" line for both actors, no warning, not a failure",
      f.calls.length === 0 && lines.length === 1 && !r.out.includes("terms of use") && r.errors.length === 0 && r.rows.length === 0, `${f.calls.length} calls; ${r.out}`);
  }
  const apifyFetch = stubFetch((url) => answer(url.includes("indeed") ? INDEED_FIXTURE : LINKEDIN_FIXTURE, 201));
  const apifyRun = await runApi(FAKE, apifyFetch, ["Apify LinkedIn", "Apify Indeed"]);
  const warnings = apifyRun.out.split("\n").filter((x) => x.includes("terms of use forbid scraping"));
  t(`Apify, token set: the terms-of-use warning once, ${apifyFetch.calls.length} runs (6 per actor), 4 rows`,
    warnings.length === 1 && apifyRun.out.indexOf("terms of use") < apifyRun.out.indexOf("Apify LinkedIn") && apifyFetch.calls.length === 12 && apifyRun.rows.length === 4 && apifyRun.errors.length === 0,
    `${apifyFetch.calls.length} calls; ${apifyRun.out}`);
  t("Apify: every run sent the token as a Bearer header, never in the URL, and it is in no output or row",
    apifyFetch.calls.every((c) => c.init.method === "POST" && c.init.headers.authorization === `Bearer ${FAKE.APIFY_TOKEN}` && !c.url.includes(FAKE.APIFY_TOKEN)) && leaks(apifyRun.out, apifyRun.errors, apifyRun.rows).length === 0, "leak");
  for (const status of [401, 403]) {
    const f = stubFetch(() => answer({ error: { type: "user-or-token-not-found", message: "User was not found or authentication token is not valid" } }, status));
    const r = await runApi(FAKE, f, ["Apify LinkedIn", "Apify Indeed"]);
    t(`Apify, HTTP ${status}: "key rejected (HTTP ${status})" for each actor, one call each, no token printed`,
      r.errors.join("|") === `Apify LinkedIn: key rejected (HTTP ${status})|Apify Indeed: key rejected (HTTP ${status})` && f.calls.length === 2 && leaks(r.out, r.errors, r.rows).length === 0,
      `${JSON.stringify(r.errors)} ${f.calls.length} calls`);
  }
  {
    const f = stubFetch(() => answer({ error: { type: "not-enough-usage-to-run-paid-actor" } }, 402));
    const r = await runApi(FAKE, f, ["Apify LinkedIn"]);
    t("Apify, HTTP 402: a FAILED source that says to check the credit", r.errors[0] === "Apify LinkedIn: HTTP 402 — payment required: check your Apify credit", JSON.stringify(r.errors));
  }
  const apifyKept = matchJobs(apifyRun.rows, financeBlank).map((j) => `${j.source}:${j.title}`);
  t(`Apify rows through matchJobs: "Senior Audit Manager" and "Financial Controller" dropped, the internships kept`,
    apifyKept.join("|") === "apify-linkedin:Audit Intern - Summer 2027|apify-indeed:Finance Intern 2027", JSON.stringify(apifyKept));
  {
    // Every source at once with every fake key: 3 Adzuna + 3 Reed + 2 LinkedIn + 2 Indeed rows, no key anywhere.
    const f = stubFetch((url) => answer(url.includes("adzuna") ? ADZUNA_FIXTURE : url.includes("/api/1.0/jobs/") ? REED_DETAILS : url.includes("reed") ? REED_FIXTURE : url.includes("indeed") ? INDEED_FIXTURE : LINKEDIN_FIXTURE, url.includes("apify") ? 201 : 200));
    const r = await runApi(FAKE, f, API_SOURCES.map((x) => x.name), financeBlank, { keep: (rows) => matchJobs(rows, financeBlank) });
    const kept = matchJobs(r.rows, financeBlank);
    t(`all four sources together: ${r.rows.length} rows, ${kept.length} kept by matchJobs, none full-time, no key anywhere`,
      r.rows.length === 10 && kept.length === 6 && kept.every((j) => /intern|placement/i.test(j.title)) && new Set(r.rows.map((x) => x.source)).size === 4 && leaks(r.out, r.errors, r.rows).length === 0,
      `${r.rows.length} rows, ${kept.length} kept: ${JSON.stringify(kept.map((j) => j.title))}`);
  }

  console.log(bad ? `\nself-test FAILED (${bad})` : "\nself-test passed — Junction parser accepts open events and rejects closed ones; scoring and filtering follow the profile");
  finished = true;
  process.exit(bad ? 1 : 0);
}

// Entry-point guard. Without it, `import { OPPORTUNITY_SOURCES }` would run the whole discovery job
// as a side effect — the same bug that has now bitten this project three times in other scripts.
const invoked = process.argv[1] && process.argv[1].endsWith("discover.mjs");
if (invoked && args.includes("--self-test")) {
  selfTest().catch((e) => {
    console.error("self-test FAILED: " + e.message);
    process.exit(1);
  });
} else if (invoked) {
  main().catch((e) => {
    console.error("discover: " + e.message);
    process.exit(1);
  });
}
