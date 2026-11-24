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
