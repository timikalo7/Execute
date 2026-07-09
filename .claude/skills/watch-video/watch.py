#!/usr/bin/env python3
"""watch-video — give Claude "eyes" on a video.

Extracts evenly-spaced frames (+ a labelled contact sheet) so the agent can Read them and
"watch" the clip, plus optional audio transcription. Self-contained: uses the ffmpeg bundled
by `imageio-ffmpeg` (no system ffmpeg / root needed). Mirrors the claude-video-vision plugin's
"perception layer" idea (frames as images + audio), but runs as a plain script.

Usage:
  python watch.py <video-path-or-URL> [--frames N] [--out DIR] [--transcribe]

Output: prints the contact-sheet path (Read it first), the individual frame paths + timestamps,
and (with --transcribe, if a whisper backend is installed) the transcript.
"""
import argparse, os, re, subprocess, sys, tempfile, shutil

def ffmpeg_exe():
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
    except Exception:
        # self-bootstrap a bundled ffmpeg (no system ffmpeg / root needed)
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "imageio-ffmpeg"])
        import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()

def find_ytdlp():
    """yt-dlp on PATH, or the pip --user install location PATH often misses."""
    exe = shutil.which("yt-dlp")
    if exe:
        return exe
    user_bin = os.path.expanduser("~/.local/bin/yt-dlp")
    return user_bin if os.path.exists(user_bin) else None

def resolve_source(src, workdir):
    """Local file → use as-is. URL → download with yt-dlp (TikTok/reels/YouTube etc.) or curl."""
    if os.path.exists(src):
        return src
    if re.match(r"^https?://", src):
        out = os.path.join(workdir, "source.mp4")
        ytdlp = find_ytdlp()
        if ytdlp:
            cmd = [ytdlp, "--no-playlist", "-f", "mp4/best", "-o", out, src]
            # YouTube extraction needs a JS runtime (EJS); node is present in this container.
            if shutil.which("node") and ("youtube.com" in src or "youtu.be" in src):
                cmd[1:1] = ["--js-runtimes", "node"]
            r = subprocess.run(cmd, capture_output=True, text=True)
            if r.returncode == 0 and os.path.exists(out):
                return out
            print("yt-dlp failed:\n" + r.stderr[-800:], file=sys.stderr)
        # fall back to a direct download (works for direct video URLs, not platform pages)
        r = subprocess.run(["curl", "-sSL", "-o", out, src])
        if os.path.exists(out) and os.path.getsize(out) > 1000:
            return out
        sys.exit("Could not fetch the URL. For platform pages install yt-dlp (pip install --user yt-dlp), "
                 "or download the file and pass a local path.")
    sys.exit(f"No such video: {src}")

def duration_seconds(ff, path):
    r = subprocess.run([ff, "-i", path], capture_output=True, text=True)
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", r.stderr)
    if not m:
        return None
    h, mn, s = m.groups()
    return int(h) * 3600 + int(mn) * 60 + float(s)

def fmt_ts(t):
    return f"{int(t//60):02d}:{int(t%60):02d}"

def extract_frames(ff, path, n, out_dir, dur):
    os.makedirs(out_dir, exist_ok=True)
    frames = []
    # spread across the clip, avoiding the very first/last frame
    span = dur if dur else 0
    for i in range(n):
        t = (span * (i + 0.5) / n) if span else i  # seconds
        fp = os.path.join(out_dir, f"frame_{i:03d}.jpg")
        subprocess.run([ff, "-y", "-ss", str(t), "-i", path, "-frames:v", "1",
                        "-q:v", "3", "-vf", "scale=640:-1", fp],
                       capture_output=True, text=True)
        if os.path.exists(fp):
            frames.append((t, fp))
    return frames

def contact_sheet(frames, out_path):
    try:
        from PIL import Image, ImageDraw
    except Exception:
        return None
    if not frames:
        return None
    cols = 3 if len(frames) > 4 else 2
    rows = (len(frames) + cols - 1) // cols
    cw, ch = 360, 230
    sheet = Image.new("RGB", (cols * cw, rows * ch), (18, 18, 18))
    d = ImageDraw.Draw(sheet)
    for i, (t, fp) in enumerate(frames):
        try:
            im = Image.open(fp).convert("RGB"); im.thumbnail((cw - 8, ch - 26))
            x, y = (i % cols) * cw, (i // cols) * ch
            sheet.paste(im, (x + 4, y + 22)); d.text((x + 6, y + 6), fmt_ts(t), fill=(255, 215, 140))
        except Exception:
            pass
    sheet.save(out_path, "JPEG", quality=82)
    return out_path

def transcribe(ff, path, out_dir):
    wav = os.path.join(out_dir, "audio.wav")
    subprocess.run([ff, "-y", "-i", path, "-ac", "1", "-ar", "16000", wav],
                   capture_output=True, text=True)
    if not os.path.exists(wav):
        return None
    # whisper shells out to an `ffmpeg` binary on PATH; this container only has the
    # imageio-ffmpeg bundle, so expose its directory (and ~/.local/bin) to the child.
    os.environ["PATH"] = os.path.dirname(ff) + os.pathsep + \
        os.path.expanduser("~/.local/bin") + os.pathsep + os.environ.get("PATH", "")
    if not shutil.which("ffmpeg"):
        link = os.path.join(os.path.expanduser("~/.local/bin"), "ffmpeg")
        os.makedirs(os.path.dirname(link), exist_ok=True)
        if not os.path.exists(link):
            os.symlink(ff, link)
    try:
        import whisper  # openai-whisper if installed
    except ImportError:
        return ("[audio extracted to %s — no whisper backend installed; "
                "`pip install openai-whisper` to transcribe]" % wav)
    try:
        model = whisper.load_model("base")
        return model.transcribe(wav).get("text", "").strip()
    except Exception as e:  # surface the real failure — a swallowed error cost a debugging round
        return "[transcription failed: %s — audio at %s]" % (e, wav)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--frames", type=int, default=12)
    ap.add_argument("--out", default=None)
    ap.add_argument("--transcribe", action="store_true")
    a = ap.parse_args()

    out_dir = a.out or tempfile.mkdtemp(prefix="watch-video-")
    work = tempfile.mkdtemp(prefix="wv-src-")
    ff = ffmpeg_exe()
    path = resolve_source(a.video, work)
    dur = duration_seconds(ff, path)

    frames = extract_frames(ff, path, a.frames, out_dir, dur)
    if not frames:
        sys.exit("No frames extracted — is this a valid video file?")
    sheet = contact_sheet(frames, os.path.join(out_dir, "contact_sheet.jpg"))

    print(f"video: {path}")
    print(f"duration: {fmt_ts(dur) if dur else 'unknown'}  |  frames: {len(frames)}")
    if sheet:
        print(f"\nCONTACT SHEET (Read this first): {sheet}")
    print("\nframes:")
    for t, fp in frames:
        print(f"  {fmt_ts(t)}  {fp}")
    if a.transcribe:
        print("\ntranscript:")
        print(transcribe(ff, path, out_dir) or "  [no audio]")

if __name__ == "__main__":
    main()
