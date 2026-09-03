/**
 * The XSS answer, in the order you should reach for it.
 *
 * The gate flags `.innerHTML`, `dangerouslySetInnerHTML`, `document.write`, `v-html` and
 * jQuery `.html()` as WARN — deliberately not FAIL, because a regex cannot tell whether
 * a value is user input. This file is what a flagged line should become.
 *
 * ORDER OF PREFERENCE, and 90% of cases stop at step 1:
 *   1. Don't render HTML. `textContent` / `{value}` in JSX escapes for you and there is
 *      no vulnerability to reason about.
 *   2. Rendering trusted, non-user data (a JSON-LD block)? Escape the delimiters — see
 *      `jsonLdSafe`.
 *   3. Genuinely need user HTML (a rich-text field)? An ALLOWLIST sanitiser. Never a
 *      denylist — you will always be one payload behind.
 */

/** Step 1's primitive. Escape and be done. */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Step 2. A `<script type="application/ld+json">` block cannot be escaped as HTML — it
 * has to stay valid JSON — so the danger is a `</script>` inside a string value ending
 * the block early. Escaping `<` as `<` is valid JSON AND cannot close the tag.
 *
 * This is what `an example marketing site/src/app/layout.tsx:137` already does, and it is why that
 * `dangerouslySetInnerHTML` is a correct WARN rather than a bug.
 */
export function jsonLdSafe(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

/**
 * Step 3. A small allowlist sanitiser — tags, attributes and URL schemes.
 *
 * Honest limit stated up front: for hostile user-generated content at scale, use a
 * maintained library (DOMPurify in a browser, sanitize-html on a server). This exists so
 * that "we needed something and there was nothing" never ends in a `.innerHTML =` of raw
 * input, and so the rules are legible in one screen.
 */
const TAGS = new Set(["p", "br", "strong", "em", "b", "i", "u", "ul", "ol", "li", "a", "code", "pre", "blockquote", "h2", "h3", "h4"]);
const ATTRS = { a: new Set(["href", "title"]) };
// `javascript:` and `data:` are the two that matter. An allowlist of schemes, again.
const SCHEME_OK = /^(https?:|mailto:|\/|#)/i;

export function sanitizeHtml(html) {
  let out = "";
  // Track what is actually open, so a closing tag with no matching opener is dropped
  // instead of emitted. Without this, input whose OPENING tag was escaped as text (an
  // attribute value containing "<" defeats the tokenizer, by design) still emitted its
  // closing tag and produced unbalanced markup that could close a caller's element.
  const open = [];
  // A deliberately strict tokenizer: anything that is not a recognised opening or
  // closing tag from the allowlist is treated as TEXT and escaped. Malformed markup
  // therefore degrades into visible text rather than into an unparsed sink.
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)\/?>|([^<]+)|</g;
  let m;
  while ((m = re.exec(String(html))) !== null) {
    const [full, tag, attrs, text] = m;
    if (text !== undefined) { out += escapeHtml(text); continue; }
    if (tag === undefined) { out += "&lt;"; continue; }
    const name = tag.toLowerCase();
    if (!TAGS.has(name)) continue; // drop the tag entirely, keep nothing of it
    if (full.startsWith("</")) {
      const at = open.lastIndexOf(name);
      if (at === -1) continue;              // never opened here — drop it
      while (open.length > at) out += `</${open.pop()}>`;
      continue;
    }

    let safeAttrs = "";
    const allowed = ATTRS[name];
    if (allowed && attrs) {
      const ar = /([a-zA-Z-]+)\s*=\s*"([^"]*)"|([a-zA-Z-]+)\s*=\s*'([^']*)'/g;
      let a;
      while ((a = ar.exec(attrs)) !== null) {
        const k = (a[1] || a[3] || "").toLowerCase();
        const v = a[2] ?? a[4] ?? "";
        if (!allowed.has(k)) continue;
        if (k === "href" && !SCHEME_OK.test(v.trim())) continue; // javascript:, data:, vbscript: all die here
        safeAttrs += ` ${k}="${escapeHtml(v)}"`;
      }
      // Any link that survives gets these — a sanitiser that emits a bare target=_blank
      // hands the opener window away.
      if (name === "a") safeAttrs += ' rel="noopener noreferrer nofollow"';
    }
    // Void elements never go on the stack.
    if (name === "br") { out += "<br>"; continue; }
    open.push(name);
    out += `<${name}${safeAttrs}>`;
  }
  // Anything still open at the end gets closed here, so the result can never leak an
  // unclosed element into the surrounding page.
  while (open.length) out += `</${open.pop()}>`;
  return out;
}
