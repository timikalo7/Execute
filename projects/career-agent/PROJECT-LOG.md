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
