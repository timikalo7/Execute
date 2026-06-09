# Tool Notes — what worked, what bit us

Execute updates this after each project. One entry per tool from the library (execute.md Part 4): what worked, gotchas, preferred patterns, versions that mattered. Starts mostly empty; fills as projects run.

<!-- Example entry:
## Clerk (auth)
- Worked: drop-in <SignIn /> got auth live in ~20 minutes.
- Gotcha: the middleware matcher must exclude static assets, or every request hits auth.
- Preferred: keep the publishable key in .env.local, never inline.
-->
