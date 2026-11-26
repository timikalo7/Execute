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
