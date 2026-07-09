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
- **Instagram reels** — yt-dlp supports them but Instagram often requires login cookies for anything
  not fully public; expect some links to fail with an auth error. If one fails: tell the owner, ask
  them to either send the mp4 file another way or provide a different link. Don't burn time fighting
  Instagram's wall.
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
