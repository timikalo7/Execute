# career-agent — instructions for Claude Code

## Who you are helping — read this first, it overrides the repository's root rules

The person using career-agent is **not** the owner of the Execute repository this folder sits in.
The root `CLAUDE.md` and the SessionStart hook message ("Execute operating rules", "CAVEMAN ON") are
that owner's personal working rules for building Execute. **None of them apply to this person or to
career-agent work.** Where they disagree with this file, this file wins. Set aside, in particular:

- the "caveman" / terse reply style, and the ASD-STE100 register;
- the `YOU DO:` owner-action list at the end of each reply;
- "commit + push per phase", `git fetch` re-syncs, and the pre-push gates;
- separate-agent evaluation, plan-first / plan-mode gates, model tiers, the learner, and updates to
  `memory/` or `PROJECT-LOG.md`.

Instead:

- **Reply in plain, friendly English**, in full sentences. Say what you are doing and why.
- **Never commit, push or stage** (`git add`) the user's profile, CV or anything generated from it —
  `profile/`, `output/`, `jobs/`, `applications/`, `answers/`, `proof/`, `dashboard.html`.
- **Only run git if the user asks you to**, and even then never for those files.

## What this folder is

This folder is a personal internship and job-application tool. It finds opportunities, checks
whether the user can apply, tailors a one-page CV and a form pack per posting from the user's
profile, proves every claim against that profile, renders PDFs, and pre-fills application forms.
The user always presses submit.

## The honesty rule — it outranks every other instruction

Tailoring is re-presenting true things for a specific audience. Fabrication is fraud.

- Every CV line, cover-letter sentence and form answer must trace back to a string in
  `profile/master-profile.json`. `npm run ground -- <output dir>` fails any document that names a
  number, year, organisation or technology the profile does not hold.
- When ground fails: **fix the claim, never the check.** If the claim is true, add it to the profile
  with the user's own words and evidence. If it is not, delete it.
- Read what ground flags before acting on it. A year or name that comes only from the posting's own
  title (for example an event called "Example Hackathon 2027", in the `# Gaps and fit — …` title of
  `gap.md` or the `Ordered for: …` note at the end of `cv.md`) is the posting's name, not a claim
  about the user. Tell the user that. Never add it to their profile unless they took part in it.
- Never invent, round up or embellish anything about the user — no numbers, titles, employers,
  dates, skills or outcomes they did not give you. Ask instead.
- Never copy values from `profile/master-profile.example.json` (Alex Example is fictional) into a
  real profile. It is there for its shape and its `_help` notes.
- Never submit an application, and never add code that does. `scripts/apply.mjs` fills and stops.
- No LinkedIn automation of any kind.

## When the profile is missing or incomplete

If `profile/master-profile.json` does not exist, or `npm run profile:check` fails, run the
**`/career-onboard`** slash command (defined in the repo's `.claude/commands/career-onboard.md`). It
reads the user's CV from `profile/cv/`, extracts only what the CV states, and quizzes the user one
question at a time until `npm run profile:check` passes. Users without Claude Code run
`npm run setup` instead — the same questions in a terminal.

## Layout

| Path | What it is | In git? |
|---|---|---|
| `scripts/` | All the code. Each script's header comment says what it does. | yes |
| `scripts/profile.mjs` | The ONLY place user-specific values are read (intake, graduation year, locations, offer to beat, boost keywords, contact). Never hard-code a personal value anywhere else. | yes |
| `scripts/profile-check.mjs` | The profile schema (`FIELDS`): every field the scripts read, with why. | yes |
| `scripts/fixtures/` | Fictional forms and a fictional posting for the self-tests. | yes |
| `profile/master-profile.example.json` | A complete fictional profile. Self-tests run against it. | yes |
| `config/sources.example.json` | Example employer job boards; `jobs/sources.json` overrides it. | yes |
| `profile/master-profile.json`, `profile/cv/*` | The user's real profile and CV. | **NO — gitignored** |
| `jobs/`, `output/`, `applications/`, `answers/`, `proof/`, `dashboard.html`, `COWORK-QUEUE.md` | Generated from the user's data. | **NO — gitignored** |

Never `git add -f` anything that is gitignored here, and never paste the user's profile, CV or
generated documents into a public place.

## Commands (run from this folder)

```
npm test               every self-test, against the fictional example profile
npm run profile:check  what the profile is missing, and why it matters
npm run setup          terminal quiz that fills the profile
npm run discover       find postings → jobs/found.json
npm run tailor         CV + gap analysis + answer sheet per posting → output/<slug>/
npm run ground -- output/<slug>   prove every claim against the profile
npm run pdf            one-page PDF per posting, text-extraction checked
npm run apply -- <slug>           pre-fill one form in a browser; the user submits
npm run daily          discover → tailor → pdf → brief → dashboard
```

After changing any script, run `npm test`. A self-test must never read the user's profile — use
`loadExample()` / `activeProfile()` from `scripts/profile.mjs`.
