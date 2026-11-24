---
description: Turn your CV into a career-agent profile, then quiz you one question at a time until `npm run profile:check` passes
argument-hint: [optional path to your CV; default is whatever is in projects/career-agent/profile/cv/]
---
## Who you are helping — read this first, it overrides the repository's root rules

The person running `/career-onboard` is **not** the owner of the Execute repository. The root
`CLAUDE.md` and the SessionStart hook message ("Execute operating rules", "CAVEMAN ON") are that
owner's personal working rules for building Execute. **None of them apply to this person or to
this command.** Where they disagree with this command, this command wins. Set aside, in particular:

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

## The task

Onboard the user to **career-agent** (`projects/career-agent/`). The goal is a complete, honest
`projects/career-agent/profile/master-profile.json` that `npm run profile:check` passes. Every CV
line, cover-letter sentence and form answer the tool writes must trace back to a string in that
file, and `npm run ground` fails anything else — so this profile is the ceiling on what the tool
can ever say about the user.

Read `projects/career-agent/CLAUDE.md` first. Work from inside `projects/career-agent/`.

## THE HONESTY RULE — it outranks everything below

- Extract ONLY what the CV actually states. Never invent, infer, round up, upgrade a title, or add
  a number, date, employer, skill or outcome the CV or the user did not give you.
- Never embellish. "Helped with" stays "helped with" until the user tells you what they actually
  did and what changed.
- If you are unsure whether something is true, ASK. Do not write it.
- Never copy anything from `profile/master-profile.example.json` (Alex Example) into the user's
  profile. Use it for its SHAPE and its `_help` notes only.
- Identity numbers and birth dates (passport, national insurance, date of birth) stay out of the
  profile: never ask for them and never store them.

## Steps

1. **Find the CV.** Look in `projects/career-agent/profile/cv/` (or the path in $ARGUMENTS) for a
   `.pdf`, `.docx` or `.txt`. If there is none, tell the user to save their CV there (the folder is
   gitignored — it never reaches git) and stop until they have.
   - `.txt`: read it.
   - `.pdf`: read it with your file-reading tool; if that fails, extract the text with the project's
     own pdf.js, from `projects/career-agent/`:
     `node --input-type=module -e "const { pdfText } = await import('./scripts/render-pdf.mjs'); const fs = await import('node:fs'); console.log((await pdfText(fs.readFileSync(process.argv[1]))).text)" profile/cv/<file>.pdf`
   - `.docx`: read it with your file-reading tool, or ask the user to export it as PDF or TXT.

2. **Extract into the schema.** If `profile/master-profile.json` does not exist, create it with the
   exact key structure of `profile/master-profile.example.json`, with every value empty — or run
   `npm run setup < /dev/null` once, which writes that empty skeleton, lists what is missing and
   exits (exit code 1 is expected there). Then fill in ONLY
   what the CV states: identity, education, each job/project/leadership entry with its dates, each
   bullet as an achievement `claim` (the CV's own words), skills grouped as the CV groups them,
   achievements and training. Leave everything else empty. Dates as `YYYY-MM` (or `present`).
   If the profile already exists, do not overwrite answers in it — only fill empty fields.

3. **Check it.** Run `npm run profile:check`. It prints every missing (required) and weak
   (recommended) field with WHY the tool needs it.

4. **Quiz the user, ONE question at a time,** until `npm run profile:check` passes (and ideally has
   no recommendations left). For each question:
   - say which field it fills and the `why` from profile:check, in one line;
   - offer a suggested answer ONLY where the CV hints at one ("Your CV says 'Python, SQL' under
     Skills — group them as programming?"), and say that it is a suggestion;
   - wait for the answer, write exactly what they said into the profile, save, move on.
   Ask especially for the **numbers, outcomes and dates behind each CV bullet** — users, time saved,
   percentages, money, team size, how long — because the grounding check only lets a generated CV
   state numbers that are in the profile, and a bullet with no number can never be made concrete.
   Also ask for everything a CV never says: target roles, countries they can work in, cities,
   intake season and year, graduation year and year of study, subject, work authorisation, known
   gaps, an offer they already hold (or none), home city, keywords that matter to them, referees
   (and whether each has agreed), availability and other logistics, a voice sample, and their
   hardest technical challenge in their own words.
   Accept "skip" and move on; skipped fields stay empty and profile:check keeps reporting them.
   Re-run `npm run profile:check` after every few answers and show the user what is left.

5. **Never invent or embellish** while doing any of this. If an answer sounds stronger than the
   user said it, read it back to them before saving.

6. **Prove it works.** When profile:check passes:
   - run `npm test` (all self-tests; they use the fictional example, not the user's data);
   - make one sample pack and ground it:
     `node --input-type=module -e "import { writePack } from './scripts/tailor.mjs'; import { loadProfile, readJson } from './scripts/profile.mjs'; import { assess } from './scripts/eligibility.mjs'; const p = loadProfile(); const item = readJson('scripts/fixtures/example-posting.json'); item.eligibility = assess(item, { profile: p }); writePack(p, item, 'output/sample-pack');"`
     then `npm run ground -- output/sample-pack`. A FAIL names the exact claim, number or year
     that is not in the profile: fix the PROFILE (with the user's true answer) or remove the claim —
     never edit the check. Read what it flags first: a year or name that comes only from the
     posting's own title (the `# Gaps and fit — …` title of `gap.md`, or the `Ordered for: …` note
     at the end of `cv.md`) is the posting's name, not a claim about the user — say so, and never
     add it to their profile unless they took part in it.
   - Tell the user the result in plain words, then point them at the daily loop in
     `projects/career-agent/README.md` (discover → tailor → ground → pdf → apply).

7. **Remind them about privacy** in one line: `profile/`, `output/`, `jobs/` and `applications/` are
   gitignored; never force-add them, and a public fork with a scheduled workflow would publish them.
