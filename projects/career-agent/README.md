# career-agent — internship applications, tailored properly

career-agent finds internships, placements and hackathons from public job-board APIs, checks
whether you can actually apply (intake year, year group, location, work authorisation, deadline),
ranks what is left against your own bar, and writes a tailored one-page CV, a gap analysis and a
full application-form pack for each one. Every claim in those documents is checked against your
profile before you see it. It then opens the real application form in a browser on your machine and
fills in what it can — and stops. You read it and press submit.

## The honesty rule

**Tailoring is re-presenting true things for a specific audience. Fabrication is fraud.**

Everything generated here — every CV bullet, every line of a form answer — must trace back to a
string in `profile/master-profile.json`. That is a runnable check, not a guideline:
`npm run ground -- output/<slug>` fails if a document names a number, year, organisation or
technology that is not in your profile. **A fail usually means something was invented — read what it
flags. Fix the claim, never the check.** If it is true, add it to your profile with evidence. (A year
or name in the posting's own title can be flagged too — see Troubleshooting.)

So the quality of everything this tool writes is capped by your profile. Put the numbers and outcomes
there: "built an app" can never become "built an app used by 120 students" unless you wrote the 120.

## Workshop quickstart

You need about 30–45 minutes, a terminal, and your current CV. Most of that time is the profile in
step 4: the terminal quiz asks about 45 numbered questions, plus follow-ups for each job, project
and achievement you add.

**1. Install Node.js 20 or newer (the LTS version is fine) and Git.**

- **Windows:** download the Node LTS installer from <https://nodejs.org/en/download> and accept the
  defaults. Download Git from <https://git-scm.com/download/win> and accept the defaults. Then open a
  **new** PowerShell window.
- **macOS:** download the Node LTS installer from <https://nodejs.org/en/download>, or with Homebrew:
  `brew install node`. For Git, run `xcode-select --install`, or with Homebrew: `brew install git`.
  Then open a new Terminal window.

Check both: `node --version` should print `v20` or higher, and `git --version` should print a
version number.

**2. Get the code and install it**

```
git clone <the repository URL your workshop gives you>
cd <the cloned folder>/projects/career-agent
npm ci
```

You do not need to download a browser. The tool makes your PDFs with a browser you already have:
Windows already has Microsoft Edge, and most Macs have Google Chrome, so the tool uses that. Check
everything works:

```
npm test
```

Every self-test runs against a fictional person (Alex Example), so this passes before you have a
profile. It prints the browser it used, for example `browser: msedge (installed)`.

Only if the tool says it found no browser (`career-agent: no browser could be started …`), install
Google Chrome or Microsoft Edge, or run this once — it downloads Playwright's own browser, about
150 MB:

```
npx playwright install chromium
```

**3. Put your CV in `profile/cv/`** — a `.pdf`, `.docx` or `.txt`. That folder is gitignored.

**4. Build your profile — pick ONE:**

- **In Claude Code:** open the repository in Claude Code and run **`/career-onboard`**. It reads
  your CV, fills in only what the CV states, then asks you one question at a time — especially for
  the numbers, outcomes and dates behind each bullet — until the profile is complete. The repository
  also holds its owner's own Claude Code rules (very short replies, a `YOU DO:` list at the end,
  "commit and push"). They are for the owner, not for you, and `/career-onboard` tells Claude to set
  them aside. If Claude still answers like that, or offers to commit or push, tell it: "I am using
  career-agent — reply in plain English and do not run git."
- **Without AI:** run **`npm run setup`**. A terminal quiz asks for every field, one question at a
  time, with the reason it is needed. Type `skip` to leave one for later; it saves after every answer,
  so you can stop and run it again.

Then check it:

```
npm run profile:check
```

It lists anything still missing and why the tool needs it, and exits 0 when the profile is complete.

**5. The daily loop**

```
npm run discover                    # find postings          → jobs/found.json
npm run tailor                      # CV + gap + form pack   → output/<slug>/
npm run ground -- output/<slug>     # prove every claim against your profile
npm run pdf                         # one-page PDF per posting, text-extraction checked
npm run apply -- --list             # see what is on the board
npm run apply -- <slug>             # open the form, fill it, STOP — you read it and submit
```

`npm run daily` runs discover → tailor → pdf → brief → dashboard in one go and writes
`dashboard.html` (open it in a browser). Track what you sent with
`npm run track -- add "Company" "Role" --url <link>`; `npm run track -- list --due` shows what to
chase. On Windows, double-click `career-agent.cmd` (refresh the board) or `apply.cmd` (fill one
form in your own Edge).

The `--` in `npm run ground -- output/<slug>` is not a typo: it passes the rest to the script.

To choose which employers' boards are searched, copy `config/sources.example.json` to
`jobs/sources.json` and edit it; `node scripts/probe-sources.mjs "Company Name"` finds a company's
board for you.

## Not studying computer science?

Set `target.sector` (e.g. `Marketing`) and `target.roles` (e.g. `Marketing intern`, `Brand placement`) in
your profile. A non-tech sector then starts from `config/sources.general.example.json` (many sectors) and
keeps only postings whose title names a word from your roles; words of three letters or fewer, like "law",
are skipped. If titles in your field use other words, add `target.title_keywords`, e.g. `["law", "legal"]`;
only those words are then used. Add employers in your field to `jobs/sources.json` with
`node scripts/probe-sources.mjs "Company"`.

## What is deliberately not automated

- **Submitting.** `apply.mjs` has no code path that presses submit. Boards prohibit programmatic
  submission, tracking systems detect template spray, and an application cannot be unsubmitted. The
  tool prepares; you send.
- **LinkedIn.** No scraping, no auto-connecting, no Easy Apply bots. LinkedIn's terms prohibit
  automated access, and the penalty is a restricted account in the middle of a job search.
- **Inventing anything.** See the honesty rule.

## Privacy

- Your profile (`profile/master-profile.json`), your CV (`profile/cv/`), and everything generated
  from them (`output/`, `jobs/`, `applications/`, `answers/`, `dashboard.html`, `proof/`) stay on your
  machine. They are all in `.gitignore`. **Do not commit them, and never `git add -f` them.**
- **A public fork plus a scheduled workflow would publish your data.** If you fork this repository
  publicly and add a GitHub Action that runs the daily loop and commits its output, your CV,
  address and phone number go onto the public internet. Run the loop locally instead.
- Nothing is sent anywhere except the requests to public job-board APIs (no personal data in them)
  and, when you run `apply`, the form you fill in your own browser.
- Date of birth, National Insurance and passport numbers are never stored. Type them on the day.
- By default the job-board requests identify themselves as `career-agent (personal job search)`. Set
  `CAREER_AGENT_CONTACT` only if you want a contact address in that header.

## Troubleshooting

| You see | Do this |
|---|---|
| `'node' is not recognized` / `node: command not found` | Install Node 20+ (step 1), then open a **new** terminal — old windows do not see the new PATH. |
| `'git' is not recognized` / `git: command not found` | Install Git (step 1), then open a **new** terminal. |
| PowerShell: `npm.ps1 cannot be loaded because running scripts is disabled on this system` | Windows blocks PowerShell scripts by default. Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once (answer `Y`), then run the command again. Or use `npm.cmd` in place of `npm` (and `npx.cmd` in place of `npx`), which this setting does not block. |
| `career-agent: no profile at profile/master-profile.json` | Run `npm run setup` or `/career-onboard`, then `npm run profile:check`. |
| `career-agent: no browser could be started (tried …)` | No Edge or Chrome started, and Playwright's own browser is not downloaded. Install Google Chrome or Microsoft Edge, or run `npx playwright install chromium` once (about 150 MB). |
| `browserType.launch: Executable doesn't exist at …` | Playwright's own browser is not downloaded. If you set `CAREER_AGENT_BROWSER=chromium` or `--browser=chromium` (Playwright's browser only), remove it so the tool uses your Edge or Chrome. Or run `npx playwright install chromium`. On a locked-down machine, set `CAREER_AGENT_CHROMIUM` to the path of a Chrome or Chromium program. |
| `career-agent: no jobs/found.json yet` | Run `npm run discover` first (or `npm run daily`). |
| `RESULT: FAIL — N claim(s) not traceable to the profile` | The named number, year or name is not in your profile. If it is true, add it to the profile with evidence; if not, remove it. Never edit the check. |
| `ground` flags a year or name that comes from the posting's own title, e.g. `year "2027" — profile covers no work in this year` for an event called "Example Hackathon 2027" | That is the posting's name, not your claim. Search the flagged file for it. In the `# Gaps and fit — …` title of `gap.md`, or the `Ordered for: …` note at the end of `cv.md` (a note for you, not in the file you upload), it is only the posting's name. In a CV line about you, remove it from that line — or, if you took part in the event, add the event to your profile. |
| `There was an error verifying your application` on a form | The site's own script had not finished setting up the form. Reload the page, wait, and run `apply` again (it checks for this and says so). |
| `npm WARN EBADENGINE`, or a `SyntaxError` when a script starts | Your Node is older than 20. Install the current LTS and open a new terminal. |

## Setup keys

**No API keys are needed.** Every environment variable below is optional and read by name only;
see `.env.example`.

| Variable | What it changes | Default |
|---|---|---|
| `CAREER_AGENT_CONTACT` | Contact string (e.g. an email) sent in the User-Agent to job-board APIs | `career-agent (personal job search)` |
| `CAREER_AGENT_PROFILE` | Path to the profile the scripts read | `profile/master-profile.json` |
| `CAREER_AGENT_BROWSER` | Which browser to try first: `msedge`, `chrome`, or `chromium` (Playwright's own download, and nothing else) | Windows: Edge, then Chrome · macOS: Chrome, then Edge · Linux: Chrome · then Playwright's own browser |
| `CAREER_AGENT_CHROMIUM` | Path to a Chrome/Chromium program. PDFs and self-tests try it before any other browser; `apply` uses it on macOS and Linux | not set |
| `CAREER_AGENT_TEST_PORT` | Fixed port for the self-tests' local fixture server | a free port |
| `CAREER_AGENT_CDP_PORT` | Fixed port for the self-tests' attach-to-browser check | a free port |

## Files

`scripts/` holds the code — each script starts with a comment saying what it does and why.
`scripts/profile.mjs` is the only place user-specific values are read. `scripts/profile-check.mjs`
lists every profile field the scripts read, with the reason. `profile/master-profile.example.json`
is a complete fictional profile with a `_help` note on every section. `CLAUDE.md` tells Claude Code
how to work in this folder.
