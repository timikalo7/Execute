# Plan — career-agent (public)

Tickets, in order, each committed as it went green and scanned for personal data before every commit.

1. Scaffold the public copy: `.gitignore` for every personal path, example profile, CV folder note.
2. Copy and scrub the scripts; move every user-specific value into `scripts/profile.mjs`, which
   reads the profile (and `CAREER_AGENT_CONTACT` for the job-board contact string).
3. `npm run profile:check` — the schema of what the scripts read, with a reason per field.
4. `npm run setup` — a one-question-at-a-time terminal quiz that saves after every answer.
5. `/career-onboard` slash command and the project `CLAUDE.md`.
6. README with a workshop quickstart; a pointer from the repository README.
7. A separate evaluation (fresh agent, spec + artefact only) before the first push.
