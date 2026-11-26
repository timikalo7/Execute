# PROJECT-LOG — career-agent (public)

## 2026-11-24 — First public release, de-personalised, with guided onboarding

**What it is.** A public copy of a career agent that was built for one person and held that person's
data in its profile and in its logic. This copy holds none: values that were hard-coded (the
job-board contact email, the offer to beat, the home city, the intake year, the graduation year,
ranking keywords) now come from each user's own profile via `scripts/profile.mjs`.

**How personal data was kept out.** Only scrubbed files were copied — never the source repository's
git history. A scanner loaded the source owner's real profile and searched every file and every
added line of every commit on the release branch for any of its values; every commit was made only
on a pass.

**Decisions.**
- `apply.mjs` lost an opt-in path that could click submit. The user always presses submit.
- The gap-analysis heading is "Gaps and fit": the grounding check read a capitalised first word as a
  claimed name, and the source only passed because its own profile happened to contain the word.
- A known weakness is kept as-is: the grounding check accepts any word found anywhere in the profile,
  including in `gaps_known`, so a skill listed only as a gap would pass if written into a CV.

**Not checked.** `/career-onboard` end to end inside Claude Code; the Windows `.cmd` launchers;
`apply.mjs` on a live employer form; `prove.mjs` / `prove-edge.mjs`; Night-of-workshop install on
attendees' machines.

**Evaluation (separate agent).** A fresh-context evaluator, given only the request and the branch,
re-ran the personal-data scanner and then hunted independently (about 90 terms built from the private
source, paraphrase comparison of capitalised words, every added line and commit message): none found.
It followed the README from a clean checkout to a passing `profile:check`, ran the daily loop
(discover 2704 postings, tailor 46, pdf 46), confirmed nothing personal becomes tracked by git, showed
`ground` failing invented claims and `apply`'s never-submit self-test going red when its guard is
broken. Findings for before the workshop: Git missing from README prerequisites; Execute's own
communication rules load in Claude Code; a year in a posting's own name trips `ground`; PowerShell
execution policy not in troubleshooting; education dates accept free text.

Evaluation (separate agent): PASS — no owner data in files, added lines or commit messages; a clean checkout following the README reaches a passing profile:check; npm test passes with no profile; ground fails invented claims; apply never submits.

## 2026-11-24 — Workshop fixes from the separate evaluation

Each fix answers one finding from the evaluation above, measured on main at 067b6f5.

- **Git was not a README prerequisite** (step 2 is `git clone`). Step 1 now installs Git as well as
  Node — Windows from git-scm.com with the defaults, macOS with `xcode-select --install` or
  `brew install git` — and checks `git --version`. A troubleshooting row covers `git` not found.
- **Execute's own rules loaded in Claude Code.** The root `CLAUDE.md` and SessionStart hook give
  anyone who opens the repository the owner's terse "caveman" replies, `YOU DO:` footers and
  "commit + push per phase". The project `CLAUDE.md` and `/career-onboard` now open with a block
  saying the person using career-agent is not the repository owner, so none of those rules apply:
  reply in plain, friendly English; never commit, push or stage the user's profile, CV or outputs;
  run git only when asked. The README tells attendees what to say if Claude still answers tersely.
  The root `CLAUDE.md` and hooks are unchanged; this is an override, not a removal.
- **A year in a posting's own name fails `ground`** (for example an event called "… 2027" when the
  profile has no work in 2027). `ground-check.mjs` is unchanged. The README now says "A fail usually
  means something was invented — read what it flags" and has a troubleshooting row: a year or name
  in the `gap.md` title or the `Ordered for:` note at the end of `cv.md` is the posting's name, not
  the user's claim. The project `CLAUDE.md` and `/career-onboard` tell Claude the same, and never to
  add it to the profile unless the user took part.
- **PowerShell's execution policy blocks `npm.ps1`.** Troubleshooting row: run
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use `npm.cmd` / `npx.cmd`.
- **Education dates took free text** ("sometime in autumn" was saved, passed `profile:check`, and
  printed on the CV). `education[0].start` and `.end` are now a `date` kind in the schema: `setup`
  refuses a non-`YYYY-MM` answer with the same "is not YYYY-MM — try again" message experience dates
  use and re-asks a free-text date already in the file; `profile:check` fails (exit 1) naming the
  field and the value. The end also accepts "present", as the experience check does. Eight new
  profile-check self-test rows and six new setup rows. They were run against two broken copies:
  with the schema accepting any text as a date, 6 profile-check rows and 2 setup rows failed; with
  setup saving dates as plain text, 5 setup rows failed.
- **"About 15 minutes" was wrong** — setup asks 44 numbered questions plus follow-ups per entry. The
  README now says about 30–45 minutes.

**Decision.** Experience, project and leadership dates that are not `YYYY-MM` stay a warning, as
before; only the education dates the evaluator reported now fail the check.

**Not checked.** The override block inside a real Claude Code session (whether it outweighs the
SessionStart hook in practice); the PowerShell fix on a Windows machine; the time estimate with a
real attendee. A separate evaluation of these fixes has not been run yet.

**Evaluation of the workshop fixes.** A fresh-context evaluator ran each fix: README Git step and
install URLs (200), the PowerShell and posting-title troubleshooting rows (the ground case reproduced
with "Example Hackathon 2035"), setup and profile:check rejecting free-text, `2027-13`, `27-09`,
empty and "present"-as-start education dates while accepting `YYYY-MM` and an end of "present",
`npm test` passing on a clean checkout, ground-check.mjs unchanged, the privacy scan passing (and
failing on a planted phone number), and one live `claude -p` from the repository root replying in
plain English with no owner-style footer. Not checked: Windows PowerShell, macOS commands, multi-turn
Claude Code behaviour, a real attendee's timing. Minor leftovers: "Present" with a capital P is
rejected with a confusing message; an education end of "present" triggers a misleading
graduation-year recommendation.

Evaluation (separate agent): PASS — all five fixes hold under real runs; npm test passes clean; ground-check unchanged; privacy scan passes and can fail; a live claude -p replied in plain English.

## 2026-11-25 — PDFs use the browser you already have; the 150 MB download is a fallback

**Why.** Step 2 of the workshop quickstart made every attendee download Playwright's own Chromium
(about 150 MB). On one shared Wi-Fi network, that is the step where a room of laptops stalls.
Windows ships Microsoft Edge, most Macs have Google Chrome, and Playwright can drive both.

**What changed.**
- `scripts/profile.mjs`: `browserCandidates(platform, env)` (pure) gives the order to try:
  `CAREER_AGENT_CHROMIUM`, then `CAREER_AGENT_BROWSER` (`msedge`, `chrome` or `chromium`), then the
  platform default (Windows: Edge, Chrome · macOS: Chrome, Edge · Linux: Chrome), then the bundled
  Chromium last. `launchBrowser(extra)` tries each in turn and prints the one it used in one line
  (`browser: chrome (installed)`, or `browser: bundled chromium, after msedge (installed) did not
  start`). When nothing starts, it throws one sentence that names both fixes; `exitIfNoBrowser`
  prints it with no stack trace and exits 3. `chromiumOptions()` is unchanged.
- `render-pdf.mjs` and `normal-cv.mjs` call `launchBrowser()`.
- `apply.mjs`: macOS and Linux now default to the `chrome` channel (Windows keeps `msedge`), with
  the same one-step fallback to the bundled Chromium as before. `CAREER_AGENT_BROWSER` works like
  `--browser=`. If the fallback browser is missing too, one line names both fixes. Its self-test
  launches go through `launchBrowser()`. The never-submit rule and `SUBMIT_LIKE` are unchanged.
- README step 2 no longer runs `npx playwright install chromium`; it is "only if the tool says it
  found no browser". A troubleshooting row covers the no-browser message, the `Executable doesn't
  exist` row is updated, and `CAREER_AGENT_BROWSER` is in the Setup keys table.

**Decisions.**
- `CAREER_AGENT_BROWSER=chromium` means Playwright's own Chromium only (after a
  `CAREER_AGENT_CHROMIUM` path, if one is set), not "Chromium first, then the installed browsers".
  That is what `--browser=chromium` already meant in `apply`, and it is the only way to force the
  bundled build on a machine that has Chrome.
- An unknown `CAREER_AGENT_BROWSER` value (for example `edge`) is refused with the valid values, not
  ignored.
- In `apply`, a `CAREER_AGENT_CHROMIUM` path still wins on macOS and Linux when no browser is named,
  as it did before Chrome became the default there, so nobody who set it gets a different browser.

**Proven (in a Linux container).**
- `npm test` exits 0 three ways: default; with `PLAYWRIGHT_BROWSERS_PATH` set to an empty directory,
  so no bundled browser exists (the output shows `browser: chrome (installed)`); and with
  `CAREER_AGENT_BROWSER=chromium` (`browser: bundled chromium`). Before this change the
  empty-directory run failed with `Executable doesn't exist`. PASS rows: 211, up from 203.
- `npm run pdf` with no bundled browser rendered the example CV to a one-page PDF and exited 0.
- Fallback at run time: a nonexistent `CAREER_AGENT_CHROMIUM` falls to Chrome;
  `CAREER_AGENT_BROWSER=msedge` (no Edge here) falls to Chrome; with only the bundled build allowed,
  it falls to that.
- The no-browser case exits 3 with one line that names both fixes. `render-pdf --self-test` runs it
  as a real child process. Eight new self-test rows. Four broken copies of `profile.mjs` (Windows
  order swapped, the override ignored, a stack trace leaking, the download fix dropped from the
  message) each turned exactly one row red.
- The same `cv.html` printed by the bundled Chromium (141) and by the installed Chrome (158): both
  one A4 page, the same embedded fonts (Libre Franklin, Source Serif 4), the same line breaks and
  section order, and 42 text lines at identical heights on a page-1 raster. About 6% of raster
  pixels differ, all from sub-pixel horizontal glyph spacing. Both pass the ATS text check; in
  `pdftotext`, Chrome's PDF keeps the spaces in the date column that the bundled build's PDF loses.

**Not checked.**
- Edge on Windows: there is no Windows machine here. The `msedge` order is a self-test row, not a
  launch.
- macOS, and Safari (the `chrome` and `msedge` channels are Chromium; Safari is never used).
- A retail Google Chrome install: this container's `google-chrome` is a wrapper around a Chrome for
  Testing build. The `chrome` channel lookup and launch are real; the binary is not retail Chrome.
- `prove.mjs` and `prove-edge.mjs` still launch the bundled Chromium directly (not in `npm test`).
  `.env.example`, `LAUNCH-CHECKLIST.md` and the `.cmd` launchers still mention
  `npx playwright install chromium`; they were outside this ticket.
- A separate-agent evaluation of this change has not been run yet.

**Follow-up (b77b077).** `.env.example` now lists `CAREER_AGENT_BROWSER` and the new meaning of
`CAREER_AGENT_CHROMIUM`; `LAUNCH-CHECKLIST.md` step 2 makes the download conditional. The `.cmd`
launchers keep their conditional "if it mentions a browser" hint, which is still valid as the
fallback. `prove.mjs` and `prove-edge.mjs` are unchanged (not workshop steps).

**Separate evaluation (fresh agent, spec + branch only).** In a fresh clone at b77b077: `npm test`
exit 0 with the default env and with an empty `PLAYWRIGHT_BROWSERS_PATH` (0 entries afterwards, so
nothing downloaded); the example CV renders to one A4 page with the same fonts and layout as the
bundled render; `CAREER_AGENT_BROWSER=edge` and `chromium`-with-no-bundled give one-line messages
and exit 3; `msedge` with no Edge and a bad `CAREER_AGENT_CHROMIUM` fall back to Chrome; the diff
changes no submit or click line. Minor, not fixed: apply's `--browser=edge` argument is not
validated (it falls back with a hint). Edge on Windows and macOS: NOT CHECKED.

Evaluation (separate agent): PASS — full `npm test` exits 0 with no bundled browser, the example CV renders identically through installed Chrome, bad browser settings give one-line messages with the specified fallback, and the never-submit code is unchanged; Edge on Windows and macOS are NOT CHECKED.

## 2026-11-26 — J.P. Morgan: student roles only

**Why.** A fresh clone of public main, run with an invented profile, wrote tailored CV folders for
full-time J.P. Morgan roles: Associate, Vice President, Private Banker and an Investment Banking
Analyst. The source's comment said the real filtering was "the UK location check here plus the
existing title rules downstream", but no title rule applied. J.P. Morgan rows travel as
opportunities, and only job-board rows go through the `INTERN_RE` filter in `main()`.

**What changed.**
- `scripts/discover.mjs`: new exported pure function `jpmStudentRole(title)`, applied in the
  J.P. Morgan source after the existing `inRange` location filter. It keeps a student role (an
  `INTERN_RE` word, or graduate / apprentice / early careers / undergraduate / industrial placement,
  or a student-programme word such as "summer"), never a title that `EXCLUDE_RE` rules out. It drops
  a senior title (Associate, Vice President, Director, Head of, Lead, Senior, Principal, Banker)
  unless the same title also names a student programme. "Summer Associate" is kept; "Product
  Controller Associate" is dropped. The source comment now says the title rule is applied there.
- Self-test: 6 KEPT titles, 7 DROPPED titles, and one row that runs the source's real `fetchAll`
  on a stubbed API answer, so a rule that exists but is not wired in fails. `selfTest` is now async
  for that row. `INTERN_RE`, `EXCLUDE_RE`, `TECH_RE`, `inRange` and every other source are unchanged.

**Decision.** The ticket's literal "student role" test (`INTERN_RE` or graduate / apprentice / ...)
does not match "Summer Associate", but the same ticket requires that title to be kept. "summer"
therefore counts as a student word, together with the other student-programme words that already
excuse a senior title. A mutant with the literal test turns the "Summer Associate" row red.

**Proven.**
- `npm test` exits 0. PASS rows (lines that start with PASS): 226 before, 240 after (+14). The
  never-submit self-test still passes.
- Rows can fail. In a scratch copy outside the repository: removing the `.filter` line from the
  source turns the wiring row red (exit 1); a rule that keeps everything turns all 7 DROPPED rows
  and the wiring row red; a rule that keeps nothing turns all 6 KEPT rows and the wiring row red;
  removing the senior exception, or using the literal student test, turns the "Summer Associate"
  row red; removing the `EXCLUDE_RE` check turns the "Internship Program Manager" row red.
- Live, with the example profile set to London and Edinburgh (countries United Kingdom, UK):
  J.P. Morgan 45 found on origin/main, 5 after. The 5 kept are all internships (two Machine Learning
  Center of Excellence internships, the Quantitative Research off-cycle internship, the Global Markets
  off-cycle internship, the AI Research Associate Program internship). Every other source's rows
  were identical by URL (devpost 9, greenhouse 3, junction 1, lever 5, mlh 24, morgan-stanley 10).
- `npm run tailor`: origin/main wrote three J.P. Morgan folders, all full-time (International
  Benefits Associate, a Private Banker role, an Investment Banking Analyst role); after the fix it
  wrote none. With the intake year also set to 2027, so the kept rows are not ruled out as an earlier
  intake, it wrote exactly the 5 kept internships and no folder for any of the 40 dropped titles.

**Known limits (not fixed, outside this ticket).**
- `EXCLUDE_RE` contains "sales", so "2027 Commercial & Investment Banking - Sales - Off-cycle
  Internship - London" is dropped, as a job-board row with that title already was.
- "2027 Asset Management Investments - Equities - Analyst Training Program - London" is dropped: no
  student word is in its title, although it reads like a graduate programme.
- In the ground-truth run, a profile that names York matched "New York" locations through
  `inRange`. That is a location rule, not changed here.

**Not checked.** Windows and macOS (Linux container only). The live result depends on what
J.P. Morgan posts on the day. A separate-agent evaluation of this change has not been run yet.

**Separate evaluation (fresh agent, spec + branch only).** Scope is the two files; `npm test` exit 0
on both sides, 226 to 240 PASS lines by one counting method, never-submit line still printed;
`jpmStudentRole` kept every student title it was given and dropped every full-time one, and returns
false (no throw) on an empty, null or non-string title; a live London/Edinburgh run with a 2027
intake gave 45 to 5 J.P. Morgan rows, the other sources' 522 URLs identical, and no CV folder for a
dropped title. Correction to the entry above: tailor also wrote two "jp-morgan-chase" folders
(a payments intern and a research fellow) that come from ANOTHER source under different titles;
they are not J.P. Morgan source rows. Limits it found: "Summer Program Manager" is kept (a student
word excuses a senior one); "Analyst Training Program" and "Associate Program" are dropped (no
student word).

Evaluation (separate agent): PASS — the filter keeps the real student roles and drops the full-time ones; tests go 226 to 240, other sources' URLs are identical, and no full-time J.P. Morgan CV folder is written.

## 2026-11-26 — Windows: two self-tests started themselves by a path Windows cannot open

**What broke.** The owner ran `npm test` on Windows (PowerShell 5.1) from a fresh clone. Four
`profile-check` CLI rows failed (`CLI: the example profile → exit 0 → exit 1`, the "names the
missing fields" rows printed nothing), and because `npm test` chains with `&&`, no later suite ran.
Cause: the self-tests in `profile-check.mjs` and `setup.mjs` start a second copy of themselves with
`new URL(import.meta.url).pathname`, which is `/C:/Users/…` on Windows — not a path Node can open —
so the child exits 1 with no output. Two rows passed only because they expected exit 1.

**Fix.** Both use `fileURLToPath(import.meta.url)` (the form `profile.mjs` and `decisions.mjs`
already used). The tool itself was never affected: only the self-tests spawn by that path.
Every other child-process call in the scripts already builds its path with `path.join` or
`pathToFileURL`.

**Proven here (Linux).** `npm test` exit 0, 240 PASS. `new URL("file:///C:/Users/x.mjs").pathname`
gives `/C:/Users/x.mjs`; `fileURLToPath(…, { windows: true })` gives `C:\Users\x.mjs`.
**Not checked here.** The rest of `npm test` on Windows: only the owner's re-run proves it.

**Separate evaluation (fresh agent, spec + commit only).** The diff is the two spawn arguments, one
`fileURLToPath` import each, and this entry; `npm test` exit 0 with 240 PASS from a fresh clone; the
Windows conversion checked in simulation; no other child process in scripts/ uses a Windows-unsafe
path, and no shell strings, npm/npx spawns, hard-coded /tmp or HOME. Not proven: a real Windows run
past these two suites.

Evaluation (separate agent): PASS — the diff touches only the two spawn arguments plus the import, `npm test` is exit 0 with 240 PASS on Linux, the Windows path conversion works in simulation, and no other Windows-unsafe child-process path exists, with a real Windows run still unproven.

## 2026-11-26 — Discovery follows the attendee's field, not only tech

**Why.** The owner ran the workshop flow as a finance student (sector Finance; roles in investment
banking, audit and finance; Edinburgh and London; summer 2027) and the dashboard showed CS roles only:
"its still showing cs stuff". Causes: `TECH_RE` was hard-coded into the job-board filter, so "Audit
Intern" and "Summer Analyst - Markets" were dropped; `config/sources.example.json` lists only tech
employers; and the Simplify and J.P. Morgan job lists reached the board with no field rule at all
(483 Simplify rows on the day, mostly CS). The header also read "Season: summer · year: 2027 2027":
the season answer already held the year and `intakeLabel` appended it again. Scope widened by the
owner mid-ticket: it must work for any field, not only finance.

**What changed.**
- `scripts/discover.mjs`: exported pure `fieldWords`, `fieldWordsRe`, `excludeRe`, `matchJobs` and
  `fieldOpportunities`. Field words are `target.title_keywords` when present; else `TECH_RE`, the
  same regex object, for a missing or tech sector; else the words of `target.roles` plus
  `target.boost_keywords`, minus words of three letters or fewer and minus generic words (intern,
  placement, summer, analyst, ...). An `EXCLUDE_RE` term that names the profile's own field (sales,
  marketing, hr / human resources, recruiter, internal, international) is skipped for that profile
  only; "internship program manager" never is. For a non-tech profile, discovered opportunities
  (job lists, hackathons, events) must name the field too; hand-added `jobs/manual.json` rows always
  stay. discover prints the field words it used. The summary line says "internship in your field".
- `scripts/profile.mjs`: `isTechSector`, `sourcesFileFor` (`jobs/sources.json`, else
  `config/sources.example.json` for tech, else `config/sources.general.example.json`), and
  `intakeLabel` no longer prints the year twice.
- `config/sources.general.example.json`: 20 boards across trading and fintech, consulting, retail,
  marketing and media, energy and engineering, and a charity, each verified live today; 16 large
  employers that cannot be fetched (Workday, Phenom, 403 to automated requests) in
  `tier2_browser_required`, each with what was measured.
- `scripts/dashboard.mjs`: "Check these yourself" reads the sources file discover used, so a non-tech
  profile sees the tier2 list; the upgrade note no longer says "for a technical career".
- README: a short "Not studying computer science?" section.

**Decisions (where the ticket's text was not followed literally).**
- The tech-sector test uses `\bIT\b`, not `IT\b`: with the literal form, "Audit" (aud-IT) and
  "Credit" read as IT and those students got `TECH_RE`. A self-test row and a mutant cover it.
- A two- or three-letter word the profile writes in capitals is an acronym and is kept (HR, PR, UX).
  Otherwise "HR intern" gives no field word. Numbers are never field words.
- Roles that give no field word at all (e.g. "Law intern") keep every internship and discover says to
  add `target.title_keywords`, rather than show an empty board.
- "vacation scheme" counts as an internship title for a non-tech profile (law firms use it).
  `INTERN_RE` is unchanged for tech.

**Proven.**
- `npm test` exits 0: 240 PASS lines before, 298 after (+58). The never-submit self-test still passes.
- Tech unchanged: the example profile, run on origin/main and on this branch back to back, wrote the
  same 8 job-board URLs and the same 57 rows (URL, title, score, verdict and tier all equal); stdout
  was byte-identical (6521 bytes). Only the summary wording differs.
- Finance persona, fresh clone: origin/main used `sources.example.json` and wrote 536 rows, 286 of
  the 492 job rows with a CS word in the title. This branch used `sources.general.example.json`;
  518 opportunity rows outside the field were dropped; 10 rows kept (Global Markets, Investment
  Banking, Quantitative Finance, Finance Engineer and Quantitative Investment Research internships,
  two Morgan Stanley finance insight events); tailor wrote 8 folders, 2 skipped as ineligible.
- Marketing persona (Marketing intern, Brand placement, Social media intern; London): 6 rows kept,
  tailor wrote 3 folders. No pure software or CS title among them; one mixes data science and
  marketing ("Data Science & Marketing Effectiveness Intern").
- Header: origin/main "for Season: summer · year: 2027 2027."; this branch "… year: 2027.".
- `node scripts/probe-sources.mjs --verify` on the general list: all 20 live.
- The rows can fail: 16 of 16 mutants in a scratch copy outside the repository turned the
  discover self-test red (rule reverted to `TECH_RE`, exclusions ignored, main() unwired, opportunity
  filter removed or dropping manual rows, sources choice broken, `intakeLabel` as on origin/main,
  literal `IT\b`, no acronym exception, generic words kept, no vacation scheme, vacation scheme for
  tech, `title_keywords` ignored, an unknown ATS in the general list).

**Known limits (not fixed here).**
- The marketing board is thin (6 rows, below the 10 asked for): the four public ATS APIs hold few UK
  non-tech student roles today. Most sit on Workday or own portals, listed in tier2. Two of the six
  are not internships in fact: `INTERN_RE` matches a bare "insight" ("Lead Insight Analyst - Marketing
  & Acquisition"), and "media" matches "Data Analytics Intern - Media Handling".
- The SmartRecruiters adapter reads the first 100 postings only (Wise has 415, Bosch 5167).
- `profile-check.mjs` still says `target.roles` and `target.sector` are only context; discover now
  reads them. The J.P. Morgan source's own `EXCLUDE_RE` is not field-aware.

**Not checked.** Windows and macOS. Live numbers depend on what employers post on the day. A
separate-agent evaluation of this change has not been run yet.

**Separate evaluation (fresh agent, spec + commits only).** Scope is the six files; `npm test` exit
0, 240 to 298 PASS, never-submit intact; tech discover output, URL lists and stdout identical to
origin/main back to back; finance, marketing, law, HR, healthcare and design profiles get their own
field words; live law and HR runs used the general list and kept no CS role. Limits it found: roles
that give no field word ("Law intern") keep every internship, CS included, until `title_keywords` is
set (discover prints how); the law board was empty today ("Trainee Solicitor Placement" is dropped
because only the profile's own role words count) and the general list has no law, healthcare or
design employers; "Lead Insight Analyst" and finance-titled engineering roles can still be kept.

Evaluation (separate agent): PASS — tech discover output, URL lists and stdout are identical to origin/main, npm test passes (240 to 298 PASS) with never-submit intact, non-tech profiles get their own field words, the multi-sector list and no CS roles, with only minor false keeps and a thin law board (documented limits).

## 2026-11-26 — Job APIs (Adzuna, Reed, opt-in Apify), an empty sector, and a stale board

**Why.** Two faults from the owner's finance role-play, both found by reading the code: (a) the
persona left `target.sector` empty, and `isTechSector` read empty as tech, so `TECH_RE` filtered the
board; (b) discover merges into `jobs/found.json`, so CS rows from an earlier example-profile run
stayed on the board. And the curated boards are thin: the last live run fetched 2107 postings and
finance kept 10, law 0. The owner's decision: Adzuna and Reed (official APIs, free keys) by default
when their keys are set; Apify's LinkedIn/Indeed scrapers only with `APIFY_TOKEN`, with a
terms-of-use warning; everything works with no keys.

**What changed.**
- `scripts/profile.mjs`: `TECH_RE` moved here (exported; discover imports the same object).
  `isTechSector`: an empty sector is non-tech when `target.roles` exist and none matches `TECH_RE`;
  otherwise the tech default as before.
- `scripts/discover.mjs`: `fieldFingerprint` (tech or not, plus the field-words regex source) is
  written to `found.json` as `field_fingerprint`; `boardForField` drops the stored rows when it
  differs and discover prints `your field changed since the last run — previous board cleared`.
  The job-API rows are added to the job-board rows before `matchJobs`, so the same INTERN_RE, field
  words, exclusions and location chain applies, then eligibility.
- New `scripts/sources-api.mjs`: Adzuna, Reed, Apify LinkedIn, Apify Indeed. Queries are
  `target.roles` × `target.locations`, capped at 10 per source per run, count printed. One request at
  a time, 300 ms apart, no retries; an owned-timer timeout on every request (25 s; Apify 150 s).
  With no key: one "not configured" line, no network call, not a failure. A refused key (401/403;
  Adzuna also 410) prints `<Source>: key rejected (HTTP n)` and is a FAILED source. Keys come from
  `process.env` only; every error message and every row is scrubbed of each key and its Basic-auth
  form; a URL is only printed through `redactUrl`, which drops the query string.
- README "More jobs (optional free keys)" (PowerShell and macOS/Linux forms; Apify's scrapers break
  LinkedIn's and Indeed's terms, so each person decides), the LinkedIn and Privacy bullets, the keys
  table; `.env.example` rows with sign-up links.

**API facts and where they came from (all fetched 2026-11-26).**
- Adzuna: <https://developer.adzuna.com/overview> (root `https://api.adzuna.com/v1/api`, `app_id` and
  `app_key` query parameters, sign-up at <https://developer.adzuna.com/signup>),
  <https://developer.adzuna.com/docs/search> (the `/jobs/gb/search/1` example, `what`, `where`,
  `results_per_page`, `content-type`), and the OpenAPI file behind
  <https://developer.adzuna.com/activedocs> (`/swagger/spec/test2.json`: every parameter, the Job
  fields `title`, `description` "truncated to 500 characters", `created`, `redirect_url`,
  `location.display_name`/`area`, `company.display_name`, and 410 "Authorisation failed"). Rate
  limit: none published; "The plans available to you, and their limits, are shown in your account"
  (<https://developer.adzuna.com/docs/terms_of_service>, which permits personal job search).
  Measured: a made-up key gets HTTP 401 `AUTH_FAIL`.
- Reed: <https://www.reed.co.uk/developers/jobseeker> (search URL
  `https://www.reed.co.uk/api/{versionnumber}/search`, `keywords`, `locationName`, `resultsToTake`
  "defaults and is limited to 100", the key as the Basic-auth username with an empty password, the
  Details URL `/api/1.0/jobs/{Job Id}`). No rate limit published. Measured: a made-up key and no key
  both get HTTP 401.
- Apify: <https://docs.apify.com/api/v2/act-run-sync-get-dataset-items-post> (`POST
  /v2/actors/:actorId/run-sync-get-dataset-items`, `username~actor-name`, the body is the input,
  `timeout`, `maxItems`, 408 past 300 s, 402 payment required), <https://docs.apify.com/api/v2>
  (`Authorization: Bearer <token>` recommended over the `token` query parameter; 429 on rate limit),
  <https://docs.apify.com/platform/integrations/api> (the token page),
  <https://docs.apify.com/api/v2/store-get> (`/v2/store?search=…&includeInputSchema=true`) and
  <https://docs.apify.com/api/v2/act-build-default-get> (the default build's input schema and
  readme). Chosen from the live store: `valig~linkedin-jobs-scraper` (9,867 users in 30 days, rating
  4.6 from 28, build 2026-11-18; input `keywords`, `location`, `limit`) and `valig~indeed-jobs-scraper`
  (6,471 users, 4.7 from 18, build 2026-11-18; input `country`, `title`, `location`, `limit`). The
  output fields read are the ones in each actor's README example. Measured: a made-up token gets
  HTTP 401 `user-or-token-not-found`.

**Decisions (where the ticket's text was not followed literally).**
- Reed's page lists result fields by display name only and shows no JSON, no wrapper name and no
  link field in search results. The parser reads those names in the page's own camelCase
  (`jobId`, `employerName`, `jobTitle`, `locationName`, `jobDescription`/`description`), takes the
  array whose items carry a job id or title, and uses the reed.co.uk link the answer carries; a row
  without one is looked up through Details only if `matchJobs` would keep it (at most 10). Reed rows
  have no posted date (none is documented for search).
- Adzuna treats 410 as a refused key too: its own spec names 410 "Authorisation failed".
- The actors' documented result-count input is `limit`, set to 25; the API's `maxItems=25` is sent
  as well. The Apify run timeout is 120 s. Indeed searches the UK (`country: "uk"`), like the other
  two. One "not configured" line and one warning line cover both Apify actors.
- A `found.json` with no fingerprint counts as the tech default, so a tech board keeps today's
  merge and any other field is cleared once.
- An API that names no employer gives `company: ""`; nothing is invented.
- The "every source failed" exit counts the employer boards as before; a failed API is listed with
  the other failures but does not change that rule.

**Proven.**
- `npm test` exits 0: 298 PASS before, 378 after (+80: discover 87 to 167). The never-submit rows
  still pass ("form was NOT submitted", "NOTHING WAS SUBMITTED", "the form did NOT fire submit").
- No keys, example profile, origin/main and this branch back to back in scratch clones: the same 8
  job-board URLs and the same 57 rows (URL, title, score, verdict, tier); stdout byte-identical
  (6461 bytes). stderr differs only by the three "not configured" lines and the clone path.
- No keys, finance persona with an EMPTY sector (Investment banking summer analyst, Audit intern,
  Finance placement; Edinburgh, London; 2027), in the clone holding the example board: discover used
  `sources.general.example.json`, printed `your field changed since the last run — previous board
  cleared (57 row(s) removed from jobs/found.json)`, and wrote 10 rows, every one with a finance field
  word in its title; none of the example board's Software Engineer or Machine Learning rows is left.
  The same run on origin/main used `sources.example.json` and wrote 535 rows, 124 with "software".
- Request shapes, from the stubbed fetch (keys redacted): Adzuna `GET
  https://api.adzuna.com/v1/api/jobs/gb/search/1?[query redacted]`, auth header no (keys in the
  query); Reed `GET https://www.reed.co.uk/api/1.0/search?[query redacted]`, auth header yes (Basic);
  Apify `POST https://api.apify.com/v2/actors/valig~linkedin-jobs-scraper/run-sync-get-dataset-items`
  and `…/valig~indeed-jobs-scraper/…`, auth header yes (Bearer), token never in the URL.
- The rows can fail: 33 of 33 mutants in a scratch copy outside the repository turned the discover
  self-test red (fix (a) reverted, roles ignored, board always kept, fingerprint without the field
  words, merge into the stored board, fingerprint not written, no-key check removed, env names
  dropped from the line, refused key unrecognised or not stopping, scrub off, Basic-auth form not a
  secret, query kept in printed URLs, a timer that never fires, no query cap, wrong Adzuna/Reed/Indeed
  fields, `where` not sent, 100 per page, no dedupe, Reed key as the password, lookups ignoring the
  filter or taking any id, `_id` leaking, Apify token in the URL, no warning, 100 per query, actor
  override not validated, US Indeed, API rows bypassing `matchJobs`, API failures not listed, no
  lookup filter). Two survived the first round and found real test gaps: a timer that never fires
  let Node exit 0 halfway through the self-test, and no row put a Basic-auth header into an error.
  An exit guard now fails an unfinished self-test, and a row covers the header.
- security-gate and system-design-gate pass on `projects/career-agent` (run with `--dir`).

**Not checked.**
- No live call with a real key: no Adzuna, Reed or Apify key exists here. Request shapes and parsing
  are proven only against stubs built from the documentation. Reed's JSON key names and link field
  are read from display names, not from a live answer: the first real Reed run should be watched.
- Adzuna's `what` with a multi-word role (all words, or any) is not documented; not measured.
- Apify cost and run time per query; the actors are third-party and can change without notice.
- Windows and macOS.

**Known limits.**
- An empty sector with one role that holds a `TECH_RE` word ("Equity research intern": "research")
  stays tech.
- The job APIs search the UK only (Adzuna's `gb` endpoint, Reed, Indeed `uk`).
- `CLAUDE.md` in this folder still says "No LinkedIn automation of any kind"; the opt-in Apify source
  conflicts with that line, which this change did not edit.
- The ticket's `scan.mjs projects/career-agent` form passes the path as a positional argument, which
  the scanner ignores: it scans the repository root and writes a warning-budget baseline. `--dir`
  scans the project.

**Separate evaluation.** Not run yet.

**Separate evaluation (fresh agent, spec + commits only).** `npm test` exit 0, never-submit intact;
no-key run identical to origin/main (57 job-board URLs, a fetch spy saw 21 identical calls and none
to adzuna, reed or apify); fake keys holding `&`, `/` and spaces rejected by all four live services
with no trace of the key in stdout, stderr or jobs/; both fixes work end to end (a field switch
clears the board once, the same field keeps the merge); malformed JSON, HTTP 500, null and throwing
fetches do not crash; security-gate and system-design-gate pass on a clean tree. Limits it found:
the key scrub does not cover percent-encoded forms (no path seen that prints one); a non-array
Apify answer counts as zero rows, not a failure; real-key parsing is unproven here.

Evaluation (separate agent): PASS — the branch behaves identically with no keys and makes no calls to the new hosts; fake keys, including ones with `&`, `/` and spaces, are rejected with no leak; both fixes work end to end; bad input does not crash; both gates pass on a clean tree.

## 2026-11-26 — Five rough edges from a non-tech attendee test

**Why.** A full CV-based attendee test on public main `be1bbab`, with a fictional marketing student:
her CV went into `profile/cv/`, a separate agent ran `/career-onboard` (33 questions, answered from
a persona sheet), then `npm run daily` and `npm run ground`. Five problems:
1. `npm run ground` failed a pack with `year "2027"` in cv.md, gap.md, answers.md and COWORK.md. The
   year came only from the posting's own title, "2027 Apprentice - Human Insight Social Research -
   London", quoted in the gap title, the "Ordered for:" note and the "why this role" answer.
2. Full-time "Lead Insight Analyst - Marketing & Acquisition" reached the board, because `INTERN_RE`
   matched a bare "insight".
3. `npm run setup < /dev/null` wrote a skeleton with the example's CS skill groups and three of its
   booleans (`target.remote_ok`, `target.bar.intern_only`, `target.events.require_travel_funding`);
   the quiz asked for the "hardest technical challenge"; profile:check recommended GitHub.
4. `/career-onboard` never asked for or offered `identity.headline` (required), so the run ended on
   `FAIL … Fix with: npm run setup (or /career-onboard)`.
5. The CV printed the SKILLS heading and then "Skills: Canva, …".

**What changed.**
- `scripts/ground-check.mjs`: `stripTarget()` removes every exact occurrence of the posting's title
  and company, case-insensitively, before the claims are read; `main()` passes both from the pack's
  `meta.json` (the source the company rule already uses). A year only inside the quoted title is no
  longer a claim; the same year anywhere else still is.
- `scripts/discover.mjs`: `INTERN_RE` counts "insight" only when followed by day(s), week(s),
  programme, program, event, evening, series or scheme, or as "spring insight".
- `scripts/setup.mjs`: `emptyLike` empties a boolean to null; the skeleton's `skills` keeps only its
  `_help` note.
- `scripts/profile-check.mjs`: `identity.links.github` carries `when: isTechSector`; `answered()`
  treats a field that does not apply as answered, so profile:check does not list it and the setup quiz
  does not ask it. The challenge question reads "The hardest challenge you solved (technical or
  not)".
- `scripts/cv-html.mjs`: with exactly one skill group, or a group keyed "skills" (any case), the items
  print with no label, in cv.html and cv.md alike. Several named groups print as before.
- `.claude/commands/career-onboard.md`: `identity.headline` is in the list to ask; with no summary
  line on the CV, Claude offers ONE suggestion built only from CV facts, says it is a suggestion, and
  saves it only if accepted or edited. A skipped required field ends with which field is missing and
  why, not a loop back to the same command.
- `README.md`: the honesty note, the troubleshooting row for ground, and a paragraph for non-tech
  profiles.

**Decisions.**
- The booleans become null, not absent: the key stays next to its `_help` note, so the user can see
  the switch. Every reader takes null as its default: `remote_ok` and `require_travel_funding` are read
  as `!== false` (profile.mjs `remoteOk`, eligibility.mjs `contextFor`); no script reads
  `intern_only`.
- `skills` keeps its `_help` note and has zero group keys.
- A stripped title becomes the lower-case word "posting", not nothing. Deleting it made the word after
  a title at a line start read as a line start, which excuses a capitalised word: an invented
  single-word employer after the title would pass. A self-test row covers it.
- The strip runs before all three checks. For numbers that changes nothing: a number in the title was
  already allowed by the company allowance.
- A profile with no sector and no roles still counts as tech (`isTechSector`), so a fresh skeleton
  still lists GitHub until the roles are known.
- `cv-html.mjs` had no self-test. It has one now, and `package.json`'s `test` script runs it: the one
  file changed outside the ticket's list, because a self-test that `npm test` never runs is not a
  check.

**Consequence for the owner to decide.** The PA Consulting "2027 Apprentice - Human Insight Social
Research - London" posting reached the marketing board only through the bare "insight" in "Human
Insight". With the fix it is dropped as well. Measured on the same 2111 fetched postings: origin/main
kept 2 job-board matches for the persona, this branch keeps 0. `INTERN_RE` has no apprentice word. If
apprenticeships should count for a non-tech profile, the low-risk place is `FIELD_INTERN_RE` (as with
"vacation scheme"), which leaves the tech filter unchanged. Not done here: outside this ticket.

**Proven.**
- `npm test` exits 0: 378 PASS before, 419 after (+41: ground 17 to 25, setup 21 to 27, profile-check
  22 to 29, discover 167 to 180, cv-html 0 to 7). The never-submit rows still pass.
- The persona rerun in scratch clones (origin/main and this branch, same 2111 postings): "Lead Insight
  Analyst" is in origin/main's found.json, output/ and dashboard, and in none of the branch's. With the
  PA posting added by hand to `jobs/manual.json` in the branch clone, `npm run ground` passes on every
  output folder (2 of 2); origin/main's PA pack still fails with the four `year "2027"` findings. Page 1
  of the branch CV, rasterised, shows SKILLS once, then the items with no label.
- `npm run setup < /dev/null` in a fresh clone: `skills` keys `["_help"]`, the three booleans null,
  no boolean anywhere in the file (origin/main: four CS groups, three `true`).
- `npm run profile:check`: the persona's profile has no GitHub line (origin/main had one); the example
  profile still passes clean, and with its GitHub link removed it still shows `! identity.links.github`
  on both.
- The tech example, origin/main against this branch, back to back: the same 2715 postings, the same 8
  job-board URLs and titles, the same 57 rows (source, URL, title, score, verdict, tier); 144 of 144
  pack files byte-identical across 24 packs (cv.md, cv.html, gap.md, answers.md, COWORK.md, meta.json);
  24 of 24 PDFs rasterise to identical images. No title changed because of the `INTERN_RE` fix.
- `npm run ground` on all 24 tech example packs: origin/main 21 pass, 3 fail, each only on the
  posting's own name ("Bath Game Jam 2026", "#BuildHybridAI 2026", "SheHacks+ 11" in the gap title
  and the "Ordered for:" note); this branch 24 of 24 pass.
- The rows can fail: 18 of 18 mutants in a scratch copy outside the repository turned their self-test
  red (ground: strip not wired in main, case-sensitive match, title deleted outright, every year
  removed, strip ignored; INTERN_RE: bare insight, no "spring insight", no "programme"; skeleton:
  booleans copied, skill groups kept; profile-check: GitHub for everyone, `when` ignored, GitHub for
  no one, old challenge wording; cv-html: every group labelled, no single-group rule, no labels at all,
  cv.md left labelled). The GitHub-for-everyone mutant also turns the setup quiz row red.

**Not checked.**
- The `/career-onboard` changes are instructions to Claude; no live onboarding run exercised them.
- Windows and macOS.

**Known limits.**
- `jpmStudentRole` (J.P. Morgan source) still reads a bare "insight" through `STUDENT_PROGRAMME_RE`;
  this ticket changed `INTERN_RE` only.
- The setup quiz's skill-group prompt still gives CS examples (programming, web_and_cloud, ...); this
  ticket changed the skeleton only.
- answers.mjs still heads the answer "Hardest technical challenge" (not edited, by the ticket).
- profile:check's last line still says `Fix with: npm run setup (or /career-onboard in Claude Code)`.
- "insight events" and "insight evenings" (plural) do not count; the ticket's list names the singular.

**Separate evaluation.** Not run yet.

**Separate evaluation (fresh agent, spec + commits only).** `npm test` exit 0, 378 to 419 PASS,
never-submit intact; ground: a year or name only inside the quoted posting title passes, the same
year or an invented employer as a CV claim fails, a missing or odd meta.json does not crash;
"Lead Insight Analyst" and "Customer Insight Manager" dropped, "Spring Insight Week" and
"Insight Programme" kept, tech discover output identical; skeleton has no example booleans or skill
groups and null reads as the default downstream; no GitHub line for a marketing profile; the tech
example CV byte-identical; the headline instruction in /career-onboard is honest. It found one
hole: a posting title that is only a year stripped every copy of that year. Fixed in ba41faa (a name
with no letter is never stripped), re-checked by a second fresh agent: PASS. Known limits: malformed
meta.json still throws a SyntaxError (unchanged); a profile with exactly one skill group, tech
included, now prints no group label.

Evaluation (separate agent): PASS — all 5 fixes behave to spec and tech output is byte-identical; the bare-year title hole the first evaluator found is closed in ba41faa and re-checked by a second evaluator.

## 2026-11-26 — Non-tech boards: weak words, core-CS titles and apprenticeships

**Why.** The owner ran the CV route on Windows, then `npm run daily`, as a fictional marketing student
(roles "Marketing intern", "Social media intern", "Brand placement"; Claude onboarding chose the boost
keywords, which included "digital marketing"). "Worth a look" showed nine rows that are not marketing
roles: two Keyrock quant internships ("Digital Assets"), four digital or software degree
apprenticeships, PA Consulting's "Digital (Digital Trust & Cyber Security)" internship, and
"Media Product Intern". Each got through on one broad word, "digital" or "media". The earlier
separate evaluation had named the same risk ("media" kept "Data Analytics Intern - Media Handling").

**What changed** (`scripts/discover.mjs`, field filter and self-test only; non-tech profiles only).
- `WEAK_WORDS` (digital, media, social, global, business, data, technology, tech, solutions,
  operations, analytics, research, strategy, management, product, products, assets, innovation,
  services, customer, insights). Per role or boost keyword, a weak word is dropped when a non-weak word
  is left ("digital marketing" gives "marketing"); when only weak words are left, they count as one
  phrase ("Social media intern" gives "social media"). `target.title_keywords` is used exactly as
  written, weak words included.
- `fieldNarrow(profile)`: null for a tech profile. Otherwise a title matching `CS_CORE_RE` (software,
  developer(s), engineer, engineering, machine learning, cyber, devops, full stack, back end, front
  end, programmer, programming) is dropped unless one of the profile's own field words matches it, and
  a title matching `\bapprentice(ship)?s?\b` is dropped unless `target.roles` or
  `target.title_keywords` contain "apprentice". The apprentice rule skips rows of kind "event"; the
  CS rule does not. Both `matchJobs` and `fieldOpportunities` apply it; `jobs/manual.json` rows always
  stay.
- `fieldFingerprint` for a non-tech profile adds `|cs:kept` or `|cs:dropped`, then `|apprentice:kept`
  or `|apprentice:dropped`. A finance board stored under the old rules has the same field words, so
  without this it would keep its old CS rows; now it is cleared once. The tech fingerprint is
  unchanged (still the legacy one).
- README: one line in "Not studying computer science?".

**Decisions.**
- A weak-only phrase is matched literally (single spaces, whole words), through the same
  `termsRegex` as before. "Social-Media" or "Data & Analytics" in a title does not match "social
  media" or "data analytics".
- `boost_keywords` do not ask for apprenticeships (the ticket names roles and title_keywords); a boost
  keyword that matches `CS_CORE_RE` does allow CS titles, because it is one of the profile's field
  words.
- The CS and apprentice rules in `matchJobs` skip a `source: "manual"` row. `main()` never passes manual
  rows to `matchJobs`, so this only matters if a caller does.
- The self-test names the persona `marketer`, not a person's name.
- Follow-up from the coordinator, same day. (1) "quant" and "quantitative" were taken out of
  `CS_CORE_RE`: quant research internships are finance roles, and for marketing the Keyrock quant
  titles are already dropped by the field filter (no field word matches). Three self-test rows were
  rewritten because the rule deliberately changed: the "own field word unlocks CS core" row uses
  "engineering" instead of "quant", the DeFi row is relabelled (quant is a field word there, not an
  unlock), and the matching fingerprint row uses the engineering profile. (2) The apprentice rule
  skips kind "event": "2027 Insight into Finance Apprenticeships" is an insight event.

**Proven.**
- `npm test` exits 0: 420 PASS before, 479 after (+59, all in discover: 180 to 239). The never-submit
  rows still pass.
- `matchJobs` and `fieldOpportunities` run directly on the ticket's titles: all ten board titles
  dropped on this branch (origin/main kept all ten in the list path, six in the board path);
  "Data Science & Marketing Effectiveness Intern" and "Marketing & Operations Analytics Co-op" still
  kept by the list path. Finance keeps "Summer Analyst - Markets", "Audit Intern 2027" and
  "Investment Banking Summer Internship", and "2027 Quantitative Research Markets Associate Program –
  Off-Cycle Internship – London", and the Morgan Stanley "Insight into Finance Apprenticeships" row as
  an event (dropped as a job). It drops "Software Engineer Intern" and "Global Markets Intern -
  Markets Engineering" (origin/main kept the second).
- Tech example, scratch clones of origin/main and this branch, back to back (re-run after the
  follow-up): 2724 postings, the same 8 job-board matches and URLs, stdout byte-identical, the same 57
  found.json rows (source, kind, URL, title, score, verdict, tier). stderr differs only in the clone's
  path.
- Marketing profile (the earlier persona profile, boost `["digital marketing", "social media",
  "Canva"]`), same 2108 postings: origin/main kept 14 rows, 8 of them CS, quant, cyber or
  apprenticeship titles; this branch keeps 2 ("Data Science & Marketing Effectiveness Intern",
  "Marketing & Operations Analytics Co-op - Strategy & Analytics"), none CS, quant or apprenticeship.
  A board written by origin/main is cleared on the first branch run ("your field changed since the
  last run — previous board cleared (14 row(s) removed …)"; measured at 7958ae8, before the
  follow-up, which does not change this fingerprint).
- Finance profile, live: origin/main and this branch both keep the same 4 rows today, among them the
  quant research internship and the Morgan Stanley apprenticeships insight event. (Before the
  follow-up, this branch dropped those two.)
- The rows can fail: 29 of 29 mutants in a scratch copy outside the repository turned the discover
  self-test red (weak list empty, weak words counted alone, no phrase, phrase dropped, title_keywords
  filtered, one weak word missing, CS rule off, CS always allowed, CS never allowed, no "cyber",
  apprentice rule off, apprentice always or never allowed, apprentice read from boost keywords,
  title_keywords ignored, only "apprenticeship" matched, either path not calling the rule, either
  path dropping manual rows, the rule applied to tech, "quant" and/or "quantitative" back in
  `CS_CORE_RE` (three mutants), the event exemption removed, the apprentice rule skipped for every
  kind, events skipping the CS rule too, `fieldOpportunities` not passing the kind, fingerprint
  without the switches). Not covered: `matchJobs` not passing the kind is an equivalent mutant,
  because job-board rows never have kind "event".

**Consequences for the owner to decide.**
- The marketing board is now 2 rows, both ruled out by eligibility on the day: the general sources
  list and Simplify hold almost no UK marketing internships. The filter is right; the supply is thin.
- A finance student who wants software or engineering roles loses them unless a field word says so
  (e.g. boost keyword "engineering"). Quant titles now depend on the field filter alone.

**Not checked.** Windows and macOS; `npm run daily` after discover (tailor, pdf, dashboard) on the
new board. Live numbers depend on what employers post on the day.

**Separate evaluation.** Not run yet.

**Separate evaluation (fresh agent, spec + commits only).** `npm test` exit 0, 420 to 479 PASS, no
PASS row removed, never-submit intact; tech discover output identical to origin/main live (57 rows,
same URLs and fingerprint); a live marketing board went from 14 rows (8 of them CS, quant, cyber or
apprenticeship) to 2, with none left; finance keeps audit, markets, investment banking and the
apprenticeships insight event; law keeps "Legal Vacation Scheme 2027", HR keeps "HR Business Partner
Intern". Hole it found, not fixed: a phrase term matches only with single spaces, so "Social-Media
Intern" is dropped for a profile whose only social-media term is the phrase "social media".

Evaluation (separate agent): PASS — tech output byte-identical on live runs, marketing board 14 to 2 with no CS/quant/cyber/apprentice rows, finance keeps its roles, and npm test is 479 PASS vs 420 with never-submit intact; the only hole is the hyphenated "Social-Media Intern" being dropped, which the log discloses.

## 2026-11-26 — every profile copy is gitignored, not only master-profile.json

**What broke.** The owner tested the CV route on Windows by renaming the Sam test profile to
`profile/sam-profile.json` (onboarding fills only empty fields, so a new person needs a fresh file).
Their local Claude then reported two untracked files: `.gitignore` covered only
`profile/master-profile.json`, so a renamed or backup profile, full of personal data, could be
committed by accident. **Fix.** `profile/*.json` is ignored, with `!profile/master-profile.example.json`
the only tracked one. Proven with `git check-ignore -v`: `profile/sam-profile.json`,
`profile/master-profile.backup.json` and `profile/master-profile.json` are ignored, the example is not.
No code changed, so no separate evaluation was needed for the push gate.
