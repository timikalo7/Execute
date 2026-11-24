# Spec — career-agent (public)

## Must
1. **No personal data in the repository.** All personal facts live in `profile/master-profile.json`
   and `profile/cv/`, both gitignored. The repository ships a fictional example profile.
2. **Onboarding that asks for everything the agent needs.**
   - `/career-onboard` (Claude Code) reads the user's CV, fills only what it states, then asks one
     question at a time, with the reason for each, until `npm run profile:check` passes.
   - `npm run setup` does the same in a terminal with no AI.
   - `npm run profile:check` lists every missing field and why a script needs it; exit 1 if incomplete.
3. **Every user-specific rule comes from the profile**: intake season and year, graduation year,
   target locations, the offer to beat, ranking keywords, and the contact string sent to job boards.
4. **Grounding:** `npm run ground` fails any generated document that claims something not in the
   profile.
5. **The user presses submit.** `apply.mjs` pre-fills forms and never clicks the final submit.
6. **`npm test`** runs every script's self-test against the example profile and passes on a clean
   clone with no personal profile present.

## Commands
`setup` · `profile:check` · `discover` · `tailor` · `ground` · `pdf` · `apply` · `dashboard` ·
`daily` · `test` — see README.md for each.

## Not
Submitting applications; LinkedIn scraping or auto-actions; inventing or embellishing claims.
