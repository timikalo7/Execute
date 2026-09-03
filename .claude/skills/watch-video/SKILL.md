---
name: watch-video
description: >
  Give Claude "eyes" on a video — extract frames + (optionally) a transcript so you can actually watch
  and analyse a clip. Use whenever the user shares a video file or ANY video link — a TikTok, an Instagram
  reel, a YouTube video/short, or a direct mp4 URL — asks you to "watch this", review a hero/marketing
  clip, check footage, read what's happening in a video, verify a screen-recording, or analyse video
  content. A pasted video link with no other instruction means "watch it and act accordingly."
---

# watch-video — a video perception pipeline

Claude can't read a video directly, but it can read images. This skill extracts evenly-spaced **frames**
(plus a labelled **contact sheet**) and an optional **audio transcript**, so you "watch" a clip by Reading
the frames. Mirrors the `claude-video-vision` plugin's perception-layer idea, as a self-contained script.

## STEP ZERO — capture before you judge (added 2026-08-28, after losing one)

**The moment a video link arrives, add a row to `ideas/INBOX.md`.** URL, date, one line of
what it showed. **Before** watching properly, before deciding whether it is real, before
deciding whether it fits. Then evaluate.

**Why this is a rule and not a nicety.** A reel about an "agent farm" — worker agents doing
research and making money, reporting to a mothership, selling on Etsy — was sent, discussed,
and never written down. The session's container was wiped, and the idea went with it: not in
`ideas/`, not in `memory/`, not in any surviving transcript. Three other idea-shaped reels
survived the same period **only because somebody wrote a file.**

Capture and evaluation are different jobs and the second one must never gate the first.
Judging takes minutes and can wait; the link is gone the moment the session ends.

**"Add it to ideas" means exactly that — the URL and a description, nothing more.** Owner
instruction, 2026-08-28, verbatim: *"next time js put the url in ideas with a description of the
reel when i say to add it to ides."* When they say add it to ideas: write the link and a plain
description of what the reel showed into `ideas/`, and stop. Do not write the essay — no strategy
section, no "what is worth stealing", no mapping onto their projects. That analysis is a separate
job they will ask for separately, and doing it uninvited buries the one line they actually wanted.
(`ideas/build-in-public-until-they-notice.md` is the over-done version that caused this rule.)

Where it goes after capture:
- a **tool** → verdict in `memory/tool-notes.md`, and the INBOX row points at it
- a **project idea** → promoted to `ideas/<name>.md`
- **neither** → the INBOX row is the whole record, which is enough

## STEP ONE — the video is not the whole post (owner instruction, 2026-08-28)

The owner's words: *"if I set you a reel, you can open the person's account, like their
profile, and check running links in their bio. You can also check the comments... the links
in the comments too."* This is standing, not one-off. **On every reel, after watching, work
the rest of the post** — creators routinely keep the actual method, the repo, the tool name
or the source out of the video and put it in the caption, a pinned comment, or the bio link.

**Caption — always works, do it first.**
```bash
yt-dlp --skip-download --dump-json "<url>" | python3 -c "import json,sys; print(json.load(sys.stdin)['description'])"
```
Also gives `uploader`, `channel` (the handle), `like_count`, `comment_count`, `upload_date`.

**Comments — works, measured 2026-08-28.**
```bash
yt-dlp --skip-download --write-comments --dump-single-json "<url>" > c.json
python3 -c "import json;[print('-',c['author'],'|',c['text']) for c in json.load(open('c.json'))['comments']]"
```
Returned 13 top-level comments on a post showing 1,763 — so it is a **sample, not the
thread**, and there is no pagination flag that fixes that. Enough to catch a pinned "code's
here" reply; not enough to prove a link is absent. Grep the text for `http`, `github`,
`.com` rather than reading them all.

**Profile / bio links — BLOCKED, all three routes measured 2026-08-28, none worked:**

| route | result |
|---|---|
| `yt-dlp "https://www.instagram.com/<handle>/"` | `WARNING: ... marked as broken` then `ERROR: HTTP Error 429: Too Many Requests` |
| `curl "https://www.instagram.com/<handle>/"` | `302` → `/accounts/login/?next=…&is_from_rle` |
| `curl -H "X-IG-App-ID: 936619743392459" ".../api/v1/users/web_profile_info/?username=<handle>"` | `401` `{"message":"Please wait a few minutes before you try again.","require_login":true}` |

Instagram walls profiles for logged-out clients; the reel media itself is not walled, which
is why the video downloads fine and the profile does not. **Report this as NOT CHECKED, never
as "no links found"** — an absent check is not a negative result (`memory/agent-graph-engineering.md` §5).
Do NOT reach for a session cookie to get around it (same reason as below: full account access,
wiped every turn, must never be committed). The two things that do work:
  1. The caption usually names the destination anyway — this one said *"it's also linked in my
     bio"* and named it as Patreon, so the bio link was known without reading the bio.
  2. If a named destination matters, hit **that** site directly rather than Instagram. Note it
     may wall you too — `patreon.com/<handle>` returned `403` behind a Cloudflare
     `<title>Just a moment...</title>` challenge on the same day. Then say so, and stop.

The permanent fix is the same one as for cookies: a local `/remote-control` session on the
owner's own machine, where the browser is already logged in.

## How to use it
1. Run the script (it self-bootstraps a bundled ffmpeg via `imageio-ffmpeg` — no system ffmpeg / root needed):
   ```bash
   python3 .claude/skills/watch-video/watch.py <video-path-or-URL> --frames 12 --out /tmp/wv
   ```
2. **Read the printed `CONTACT SHEET` path first** — one image, all frames with timestamps, to grasp the clip
   at a glance. Then Read individual `frame_NNN.jpg` paths for any moment you need in detail.
3. Add `--transcribe` to also get the audio transcript (needs a whisper backend — `pip install openai-whisper`
   — otherwise it just extracts the audio and tells you).

## Reel / TikTok / YouTube links — the paste-a-link workflow (PROVEN 2026-07-07)

When the owner pastes a video link, this is the whole flow — no plugin, no extra MCP:

```bash
pip install --user --quiet yt-dlp   # once per container; watch.py finds ~/.local/bin itself
python3 .claude/skills/watch-video/watch.py "<the-link>" --frames 10 --out /tmp/wv
```

Then Read the contact sheet, Read any frame that matters, add `--transcribe` if the audio carries the
content, and **act on what you saw** (implement the technique, review the design, answer the question —
whatever the owner's intent was).

Platform reality (tested through this container's proxy, 2026-07-07):
- **TikTok** — WORKS end-to-end: metadata + mp4 download, straight through `watch.py <url>`, verified
  on a real public TikTok (frames read fine). The "impersonation … no impersonate target" warning is
  harmless — see the curl_cffi trap below.
- **Direct mp4/webm URL** — WORKS end-to-end (curl fallback even without yt-dlp).
- **YouTube / Shorts** — metadata works (`yt-dlp --print`), but the media download often 403s from a
  datacenter IP (bot wall); `watch.py` passes `--js-runtimes node` for YouTube links which future
  yt-dlp versions may honor. Try the link — if it 403s, tell the owner rather than fighting it.
- **Instagram — RE-MEASURED 2026-08-13: reels WORK end-to-end again.** `watch.py <reel-url>` ran
  clean on a real public reel and produced a contact sheet plus 12 frames; a bare
  `yt-dlp -o "%(ext)s"` downloaded 8.73 MiB of video and merged the audio track without a format
  flag. **Treat Instagram as a normal source and just try it first.**
    - The 2026-08-12 entry recorded reels as permanently broken (*"Instagram sent an empty media
      response"*). That was wrong as a general rule — it was a transient failure on two posts,
      recorded as a property of the platform. **The lesson is bigger than Instagram: two failures is
      an observation, not a law.** When a source fails, retry it before writing it off in a skill,
      and date the finding so the next session knows how stale it is.
    - **Carousels** (`/p/<id>/`): resolve to child items with *"No video formats found"* — they are
      images. Metadata and full-size thumbnails DO download, and tiling those into a contact sheet
      works well.
  If a reel *does* fail: `--dump-json` still returns uploader, title and the FULL CAPTION, and these
  creators put the whole method in the caption surprisingly often. The embed page is no help —
  `/embed/captioned/` returns a login-walled JS shell (0 media URLs).

  **Do NOT reach for cookies.** An Instagram session cookie is full account access, this container is
  wiped between turns so it would have to be re-supplied constantly, and it must never be committed.
  The cost/benefit is wrong for watching one clip.

  **The ladder, cheapest first:**
    1. **Just run `watch.py <url>`, and RETRY ONCE if it fails.** As of 2026-08-13 this works for
       Instagram reels. Measured the same day: a reel that returned *"Instagram sent an empty media
       response"* downloaded 13.9 MiB on the very next attempt, nothing changed in between. So the
       empty-media error means *try again*, not *give up* — do not skip to a fallback because of one
       failure, or because a previous session recorded one.
    2. Read the caption via `--dump-json` and say plainly that you are going on the caption, not the
       video.
    3. For a carousel, download the thumbnails and tile them — that is real seeing, not a workaround.
    4. **The permanent fix is a local session.** Once the owner has Claude Code on their own machine
       with `/remote-control`, that session has their logged-in browser and can use
       `--cookies-from-browser` locally, then hand over the frames. Nothing sensitive leaves their box.

  **The pipeline itself is not the problem, and prove that before blaming it.** Verified 2026-08-12 by
  generating a local mp4 with ffmpeg and running watch.py on it: 4/4 frames extracted. If a video
  fails, the fetch failed, not the extraction — say which.
- **TRAP — a crash inside yt-dlp's import chain is an ENVIRONMENT bug, not a fetch failure. Do not
  retry the URL.** Seen 2026-08-17: every link failed with
  `pyo3_runtime.PanicException: Python API call failed`, raised from `secretstorage` importing
  `cryptography`. Cause: the system `cryptography` 41.0.7 in `/usr/lib/python3/dist-packages` ships
  Rust bindings built for a different Python than the `python3.11` running yt-dlp, and yt-dlp imports
  `secretstorage` for its cookie support even when you never ask for cookies. Fix, one command:
  ```bash
  pip install --user --upgrade cryptography     # pulled 50.0.0 into user site-packages, which shadows the system one
  ```
  Then the same URL worked first try. **Read the traceback before applying the Instagram retry-once
  rule** — the empty-media error means retry; a Python traceback means fix the environment.
- **TRAP — never `pip install curl_cffi` (or `yt-dlp[curl-cffi]`) in this container.** Once installed,
  yt-dlp auto-impersonates on TikTok/YouTube and the impersonated TLS fingerprint gets RESET by the
  agent proxy (`curl: (35) Recv failure: Connection reset by peer`) — it breaks the PREVIOUSLY-WORKING
  TikTok path too. Verified 2026-07-07; `pip uninstall -y curl_cffi` restored it immediately.
- If yt-dlp itself is blocked for a link, second chance: a link-to-mp4 conversion API the owner
  approves (e.g. cobalt.tools' API) — but ask before wiring any third-party endpoint (supply-chain
  rule), and never paste private links into one.

## Inputs / notes
- **Local file:** pass the path. **URL/YouTube:** pass the URL — it uses `yt-dlp` if installed
  (`pip install yt-dlp`), else falls back to a direct download (works for direct media URLs, not YouTube pages).
  If the user has a video only in chat (an attachment), remember remote sessions **can't read chat attachments
  as files** — ask them to commit it to the repo or give a URL/path.
- `--frames N` controls sampling density (default 12); bump it for long or fast-moving clips.
- The static ffmpeg build has no `drawtext`/freetype filter — don't rely on text-overlay filters.

## Bug reports as video — the fastest way for the owner to report a UI bug
A screen recording beats a written repro. Instead of the owner typing "sometimes it errors but only
when I go from chat to dashboard and the tab behaviour is funky", they record the bug happening and
hand over the file or path. Then:
1. **Frame the whole clip first** (`--frames 12+`) and read the contact sheet to find *when* it goes
   wrong — the moment the UI breaks is visible even when the words are vague.
2. **Re-sample around the failure.** Run again with a tighter window/higher `--frames` so you have
   dense frames right before, at, and after the break, instead of guessing from one thumbnail.
3. **Correlate with the console, don't eyeball it.** Reproduce the same flow with `browser-drive` /
   `visual-qa` and line the console errors and their timestamps up against the frames. "Three errors
   at ~18s and ~21s" plus the frames at 18s and 21s is a real diagnosis; a screenshot alone is not.
4. **Confirm the repro before fixing.** Drive the exact sequence you saw in the video and watch it
   fail yourself. Then fix, and re-drive the same sequence to prove it passes — a fix you did not
   watch fail-then-pass is unverified (`memory/agent-graph-engineering.md`).
5. If the clip has narration, transcribe it (`--transcribe`) — the owner usually says what they
   expected to happen, which is the actual spec.

## The official plugin (optional, richer — owner installs it themselves)
For a fuller experience there's **`claude-video-vision`** (jordanrendric/claude-video-vision): a Claude Code
plugin + MCP server giving `/watch-video path.mp4 "question"`, conversational video mentions, and built-in
transcription (whisper / Gemini / OpenAI). It is **not auto-wired here on purpose** — registering a third-party
MCP server that runs `npx -y claude-video-vision@latest` at startup is exactly the supply-chain action we don't
do silently (see `memory/principles.md`: dev-environment = supply chain). If the owner wants it, *they* install
it explicitly in an interactive session:
```
/plugin marketplace add https://github.com/jordanrendric/claude-video-vision
/plugin install claude-video-vision
/setup-video-vision
```
Until then, **this script is the working, dependency-light video-vision pipeline** and needs no plugin/MCP load.
