/**
 * A file upload that actually validates.
 *
 * The client-supplied MIME type and the file extension are both attacker-controlled.
 * `image/png` in a header means nothing; the bytes decide.
 *
 *   1. SIZE is checked first and cheaply — a 4 GB "image" should be rejected before
 *      anything reads it.
 *   2. MAGIC BYTES decide the type, not the extension and not the header.
 *   3. The FILENAME is regenerated, never reused. `../../etc/passwd` and `photo.png.svg`
 *      are both filenames.
 *   4. SVG is not an image for upload purposes — it is a script container.
 */
export class UploadError extends Error {
  constructor(reason) { super(reason); this.name = "UploadError"; this.reason = reason; }
}

// Signatures long enough to be meaningful. JPEG/PNG/GIF/WEBP/PDF only — an allowlist,
// because a denylist of dangerous types is a list you will always be behind on.
const MAGIC = [
  { ext: "jpg", mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { ext: "png", mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { ext: "gif", mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { ext: "pdf", mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  { ext: "webp", mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46], at: 0, also: { at: 8, bytes: [0x57, 0x45, 0x42, 0x50] } },
];

const startsWith = (buf, bytes, at = 0) => bytes.every((b, i) => buf[at + i] === b);

/** What are these bytes REALLY? Returns null when nothing in the allowlist matches. */
export function sniff(buf) {
  for (const m of MAGIC) {
    if (!startsWith(buf, m.bytes, m.at ?? 0)) continue;
    if (m.also && !startsWith(buf, m.also.bytes, m.also.at)) continue;
    return { ext: m.ext, mime: m.mime };
  }
  return null;
}

/** Strip every path component and every trailing extension games. Never trusted, only logged. */
export function safeBaseName(name) {
  return String(name).replace(/\\/g, "/").split("/").pop().replace(/[^\w.\- ]/g, "_").slice(0, 100);
}

/**
 * @param buf         the received bytes
 * @param clientName  the filename the client claims (used for logging only)
 * @param clientMime  the Content-Type the client claims (checked for CONSISTENCY, never trusted)
 */
export function validateUpload(buf, { clientName = "", clientMime = "", maxBytes = 5 * 1024 * 1024, allow = ["jpg", "png", "webp", "pdf"] } = {}) {
  if (!Buffer.isBuffer(buf)) throw new UploadError("not bytes");
  // Cheapest check first.
  if (buf.length === 0) throw new UploadError("empty file");
  if (buf.length > maxBytes) throw new UploadError(`too large: ${buf.length} > ${maxBytes}`);

  const real = sniff(buf);
  // Nothing in the allowlist matched — that includes SVG, HTML, scripts, archives and
  // anything else. Unknown is a rejection.
  if (!real) throw new UploadError("unrecognised file type (magic bytes match nothing allowed)");
  if (!allow.includes(real.ext)) throw new UploadError(`type not allowed: ${real.ext}`);

  // A mismatch between what they SAID and what it IS is worth refusing outright: it is
  // either an attack or a broken client, and neither should be stored.
  if (clientMime && clientMime !== real.mime) throw new UploadError(`declared ${clientMime} but bytes are ${real.mime}`);

  return {
    // The stored name is generated. The client's name is never part of a path.
    storedName: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.${real.ext}`,
    mime: real.mime,
    ext: real.ext,
    bytes: buf.length,
    originalNameForLogsOnly: safeBaseName(clientName),
  };
}

/**
 * Serving rules, which are half the vulnerability and live outside this function:
 *   - serve uploads from a DIFFERENT origin (or a path with no cookies) so a stored file
 *     cannot read a session;
 *   - always send `Content-Type` from `mime` above and `X-Content-Type-Options: nosniff`;
 *   - always send `Content-Disposition: attachment` for anything that is not an image;
 *   - never serve from a directory the app can execute.
 */
