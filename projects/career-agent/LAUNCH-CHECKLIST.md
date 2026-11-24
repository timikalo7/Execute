# Launch checklist — workshop use

Before the session:
- [ ] Attendees have Node 20+ installed (https://nodejs.org, LTS) and Git.
- [ ] Attendees have a CV as PDF, DOCX or TXT.
- [ ] Optional: Claude Code installed and signed in, for `/career-onboard`; otherwise `npm run setup`.
- [ ] The repository is public and the quickstart in README.md works from a clean clone.

In the session:
1. `git clone <this repository URL> && cd Execute/projects/career-agent` (the organiser shares the link)
2. `npm ci && npx playwright install chromium`
3. Put your CV in `profile/cv/`.
4. Claude Code: `/career-onboard` — or terminal: `npm run setup`.
5. `npm run profile:check` until it passes.
6. `npm run discover`, then `npm run daily`, then open `dashboard.html`.

Privacy reminder for attendees: your profile and CV are gitignored. Do not force-add them, and do not
publish a fork with them in it.
