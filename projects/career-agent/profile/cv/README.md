# Put your CV here

Drop your current CV in this folder as a `.pdf`, `.docx` or `.txt` file. Then either:

- run `/career-onboard` in Claude Code, which reads it and turns it into `profile/master-profile.json`,
  then asks you about everything it could not find; or
- run `npm run setup`, a terminal quiz that asks for every field one question at a time (no AI).

Everything in this folder except this README is **gitignored**. Your CV never leaves your machine
through git. Do not force-add it, and do not move it somewhere that is tracked.

Optional: if you also have a non-technical CV (for shift or agency work), save it here as a PDF and
point `cv_files.normal_pdf` in your profile at it. `node scripts/normal-cv.mjs` checks that its text
can be read back out before anything attaches it.
