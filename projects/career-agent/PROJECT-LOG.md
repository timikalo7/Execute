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
