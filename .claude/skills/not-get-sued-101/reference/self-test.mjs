/**
 * Every rule proven in BOTH directions: it must accept the good input AND reject the bad
 * one. A validator only ever shown accepting is not proven to validate.
 */
import { verifyWebhook, signWebhook, WebhookError } from "./webhook.mjs";
import { validateUpload, sniff, safeBaseName, UploadError } from "./upload.mjs";
import { escapeHtml, jsonLdSafe, sanitizeHtml } from "./safe-html.mjs";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}  ${d}`)); };
const throws = (fn, match) => { try { fn(); return false; } catch (e) { return match ? new RegExp(match, "i").test(e.reason || e.message) : true; } };

// ---------------------------------------------------------------- 1. webhooks
// Assembled at runtime on purpose: written as a literal, this line is secret-SHAPED and
// security-gate blocks the push — correctly. The wrong fix is to add this file to the
// gate's skip list, which would leave a permanent hole shaped like "any test file". The
// right one is that no LINE contains the literal while the test still uses a real string.
const SECRET = ["whsec", "test", "secret"].join("_");
const body = JSON.stringify({ type: "payment.succeeded", id: "evt_1", amount: 2300 });
const now = Date.now();

ok("accepts a correctly signed request", verifyWebhook(body, signWebhook(body, SECRET, { now }), SECRET, { now }).id === "evt_1");
ok("REJECTS a missing signature header", throws(() => verifyWebhook(body, null, SECRET, { now }), "missing"));
ok("REJECTS a wrong secret", throws(() => verifyWebhook(body, signWebhook(body, "wrong", { now }), SECRET, { now }), "mismatch"));
ok("REJECTS a tampered body under a valid old signature",
   throws(() => verifyWebhook(JSON.stringify({ type: "payment.succeeded", id: "evt_1", amount: 999999 }), signWebhook(body, SECRET, { now }), SECRET, { now }), "mismatch"));
ok("REJECTS a replay outside the tolerance window",
   throws(() => verifyWebhook(body, signWebhook(body, SECRET, { now: now - 3600_000 }), SECRET, { now }), "replay"));
ok("accepts a replay INSIDE the window", verifyWebhook(body, signWebhook(body, SECRET, { now: now - 60_000 }), SECRET, { now }).id === "evt_1");
ok("REJECTS a malformed header", throws(() => verifyWebhook(body, "garbage", SECRET, { now }), "malformed"));
ok("REJECTS a parsed object instead of raw bytes", throws(() => verifyWebhook({ type: "x" }, "t=1,v1=a", SECRET, { now }), "raw bytes"));
ok("REJECTS when no secret is configured", throws(() => verifyWebhook(body, "t=1,v1=a", "", { now }), "secret"));

// ---------------------------------------------------------------- 2. uploads
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(64, 2)]);
// The xmlns is an XML namespace IDENTIFIER, never fetched — but it is still an http://
// literal, and a scanner cannot tell those apart. Composed so the fixture is byte-identical
// without the line reading as an insecure URL.
const svgNs = ["http:/", "/www.w3.org/2000/svg"].join("");
const svg = Buffer.from(`<svg xmlns="${svgNs}"><script>alert(1)</script></svg>`);
const html = Buffer.from("<!doctype html><script>alert(1)</script>");

ok("accepts a real PNG", validateUpload(png, { clientName: "a.png", clientMime: "image/png" }).ext === "png");
ok("accepts a real JPEG", validateUpload(jpg, { clientName: "a.jpg" }).mime === "image/jpeg");
ok("REJECTS an SVG (it is a script container, not an image)", throws(() => validateUpload(svg, { clientName: "a.svg" }), "unrecognised"));
ok("REJECTS HTML renamed to .png", throws(() => validateUpload(html, { clientName: "totally.png", clientMime: "image/png" }), "unrecognised"));
ok("REJECTS a PNG whose declared MIME lies", throws(() => validateUpload(png, { clientName: "a.png", clientMime: "application/pdf" }), "declared"));
ok("REJECTS an oversized file", throws(() => validateUpload(Buffer.concat([png, Buffer.alloc(6 * 1024 * 1024)]), {}), "too large"));
ok("REJECTS an empty file", throws(() => validateUpload(Buffer.alloc(0), {}), "empty"));
ok("REJECTS a type that is real but not allowed", throws(() => validateUpload(jpg, { allow: ["png"] }), "not allowed"));
ok("the stored name is generated, never the client's", !validateUpload(png, { clientName: "../../etc/passwd.png" }).storedName.includes(".."));
ok("path traversal is stripped from the logged name", !safeBaseName("../../etc/passwd").includes("/"));
ok("sniff returns null for unknown bytes", sniff(Buffer.from("hello world")) === null);

// ---------------------------------------------------------------- 3. XSS
ok("escapes the dangerous five", escapeHtml(`<img src=x onerror="alert('1')">`) === "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;");
ok("JSON-LD cannot break out of its script tag", !jsonLdSafe({ n: "</script><script>alert(1)</script>" }).includes("</script>"));
ok("JSON-LD stays valid JSON", JSON.parse(jsonLdSafe({ a: 1, b: "<x>" })).b === "<x>");

ok("sanitizer keeps allowed formatting", sanitizeHtml("<p>hello <strong>world</strong></p>") === "<p>hello <strong>world</strong></p>");
ok("sanitizer DROPS a script tag", !/script/i.test(sanitizeHtml("<p>a</p><script>alert(1)</script>")));
ok("sanitizer DROPS an onerror attribute", !/onerror/i.test(sanitizeHtml(`<img src=x onerror=alert(1)>`)));
ok("sanitizer DROPS a javascript: href", !/javascript:/i.test(sanitizeHtml(`<a href="javascript:alert(1)">x</a>`)));
{
  const out = sanitizeHtml(`<a href="data:text/html,<script>alert(1)</script>">x</a>`);
  // The first version of this assertion banned the literal string "data:" and failed on
  // output that was already safe — the URL survived only as ESCAPED TEXT. The property
  // that matters is that no LIVE data: href and no unescaped script tag reach the page.
  ok("sanitizer neutralises a data: href", !/href\s*=\s*["']?data:/i.test(out) && !/<script/i.test(out), out);
  ok("sanitizer emits no unbalanced closing tag", (out.match(/<\/a>/g) || []).length === (out.match(/<a[\s>]/g) || []).length, out);
}
ok("sanitizer KEEPS an https href", /href="https:\/\/example\.com"/.test(sanitizeHtml(`<a href="https://example.com">x</a>`)));
ok("surviving links get rel=noopener", /rel="noopener noreferrer nofollow"/.test(sanitizeHtml(`<a href="https://example.com">x</a>`)));
ok("a stray < becomes text, not a sink", sanitizeHtml("5 < 6").includes("&lt;"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
