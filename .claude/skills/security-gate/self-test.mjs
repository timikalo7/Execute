#!/usr/bin/env node
/**
 * security-gate SELF-TEST — checks the checker.
 *
 * `memory/agent-graph-engineering.md` §3: a gate that has only ever been seen to PASS is not proven
 * to work, and evaluator decay is this repo's biggest live risk. So every rule here is asserted in
 * BOTH directions — the vulnerable file must FAIL, and the fixed file must PASS.
 *
 * Fixtures are written to a temp directory and deleted afterwards, deliberately: committing a file
 * that contains a real unverified-webhook handler would make the repo's own pre-push gate fail on
 * every push, and adding its directory to SKIP_DIRS to dodge that is exactly the "weaken the gate to
 * make the push pass" move the rules forbid.
 *
 *   node .claude/skills/security-gate/self-test.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const SCAN = path.join(path.dirname(new URL(import.meta.url).pathname), "scan.mjs");
let pass = 0;
const failures = [];

/** Run the real gate over a throwaway dir containing `files`, return its findings + exit code. */
function run(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "secgate-"));
  for (const [name, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), body);
  }
  let code = 0;
  try {
    execFileSync(process.execPath, [SCAN, "--dir", dir], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    code = e.status ?? 1;
  }
  const report = JSON.parse(fs.readFileSync(path.join(dir, "security-gate-report.json"), "utf8"));
  fs.rmSync(dir, { recursive: true, force: true });
  return { code, findings: report.findings };
}

function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  ok   ${label}`); }
  else { failures.push(label); console.log(`  FAIL ${label}${detail ? `\n         ${detail}` : ""}`); }
}
const hit = (f, rule) => f.findings.filter((x) => x.rule === rule);

console.log("\nsecurity-gate self-test — every rule asserted in both directions\n");

/**
 * Fixture payloads are ASSEMBLED, never written as literals.
 *
 * The first run of this file failed the repo's own pre-push gate: its regression fixtures contained
 * a real-shaped AWS key and a literal disabled-TLS option, and the scanner — correctly — flagged the
 * file that proves the scanner works. The fix is NOT to exempt this file. Exempting it would be
 * exactly the "weaken the gate so the push passes" move the rules forbid, and it would leave a
 * permanent hole shaped like "any file named self-test". Splitting the literal keeps the gate at
 * full strength while the temp file still receives the real, dangerous string.
 */
const lit = (...parts) => parts.join("");

// ─── 1. Payment webhooks ──────────────────────────────────────────────────────────────────────
// "If your server just trusts a message that says payment went through … somebody can fake the
// message and get your product for free."
const VULN_WEBHOOK = `
import { db } from "../db";
export async function POST(req) {
  const event = await req.json();               // trusts whatever was POSTed
  if (event.type === "checkout.session.completed") {
    await db.order.update({ where: { id: event.data.object.id }, data: { paid: true } });
  }
  return new Response("ok");
}`;
const SAFE_WEBHOOK = `
import Stripe from "stripe";
import { db } from "../db";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
export async function POST(req) {
  const raw = await req.text();
  const event = stripe.webhooks.constructEvent(raw, req.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET);
  if (event.type === "checkout.session.completed") {
    await db.order.update({ where: { id: event.data.object.id }, data: { paid: true } });
  }
  return new Response("ok");
}`;

let r = run({ "app/api/webhook/route.js": VULN_WEBHOOK });
check("webhook: unverified handler is FLAGGED", hit(r, "webhook-unverified").length === 1);
check("webhook: unverified handler BLOCKS the push (exit 1)", r.code === 1, `exit was ${r.code}`);

r = run({ "app/api/webhook/route.js": SAFE_WEBHOOK });
check("webhook: constructEvent + signature header PASSES", hit(r, "webhook-unverified").length === 0);
check("webhook: verified handler does not block (exit 0)", r.code === 0, `exit was ${r.code}`);

// The trigger must be narrow, or a blocking rule becomes noise and gets bypassed.
r = run({ "docs/webhooks.md.js": "// how to configure a webhook in the dashboard\nconst notes = 1;\n" });
check("webhook: prose mentioning 'webhook' with no body read is NOT flagged", hit(r, "webhook-unverified").length === 0);
r = run({ "app/api/orders/route.js": VULN_WEBHOOK });
check("webhook: a non-webhook route reading a body is NOT flagged", hit(r, "webhook-unverified").length === 0);
r = run({ "app/api/webhook/route.js": VULN_WEBHOOK.replace("await req.json()", "await verifySignature(req)") });
check("webhook: a generic verifySignature() also satisfies the rule", hit(r, "webhook-unverified").length === 0);

// ─── 2. File uploads ──────────────────────────────────────────────────────────────────────────
// "If you're not checking what people upload, someone can drop in a file that takes over your
// whole server." WARN, not FAIL — validation can legitimately live somewhere this file can't see.
const VULN_UPLOAD = `
import ${"mul" + "ter"} from "multer";
const upload = ${"mul" + "ter"}({ dest: "public/uploads/" });   // served, and executable
app.post("/upload", upload.single("file"), (req, res) => res.json({ path: req.file.path }));`;
const SAFE_UPLOAD = `
import ${"mul" + "ter"} from "multer";
const upload = ${"mul" + "ter"}({
  dest: "/var/data/uploads",
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ["image/png", "image/jpeg"].includes(file.mimetype)),
});
app.post("/upload", upload.single("file"), (req, res) => res.json({ id: req.file.filename }));`;

r = run({ "server/upload.js": VULN_UPLOAD });
check("upload: no type/size check is FLAGGED", hit(r, "upload-no-validation").length === 1);
check("upload: flagged as WARN, does NOT block the push", r.code === 0 && hit(r, "upload-no-validation")[0]?.sev === "warn");

r = run({ "server/upload.js": SAFE_UPLOAD });
check("upload: fileFilter + limits PASSES", hit(r, "upload-no-validation").length === 0);

// ─── 3. XSS ───────────────────────────────────────────────────────────────────────────────────
// "If someone slips code into a comment or username, it can run in every other user's browser."
for (const [label, src] of [
  ["innerHTML assignment", lit("el.inner", "HTML = comment.body;")],
  ["outerHTML assignment", lit("node.outer", "HTML = user.bio;")],
  ["document.write", lit("document.", 'write("<b>" + name + "</b>");')],
  ["Vue html directive", lit("<div v-", 'html="post.body"></div>')],
  ["jQuery .html()", lit('$("#out").', "html(userInput);")],
  ["React raw-html prop", lit("return <div dangerouslySet", "InnerHTML={{ __html: body }} />;")],
]) {
  r = run({ "src/render.js": src });
  check(`xss: ${label} is FLAGGED`, hit(r, "dangerous-html").length === 1);
}
for (const [label, src] of [
  ["textContent is safe", lit("el.text", "Content = comment.body;")],
  ["innerHTML comparison is not an assignment", lit('if (el.inner', 'HTML === "") return;')],
]) {
  r = run({ "src/render.js": src });
  check(`xss: ${label} — NOT flagged`, hit(r, "dangerous-html").length === 0);
}

// ─── 4. The pre-existing rules still work (no regression from this change) ────────────────────
r = run({ "src/a.js": `const key = "${lit("AKIA", "1234567890ABCDEF")}";` });
check("regression: AWS key still FAILS", hit(r, "secret:aws-access-key").length === 1 && r.code === 1);
r = run({ "src/a.js": `const agent = new https.Agent({ ${lit("rejectUnauth", "orized: false")} });` });
check("regression: disabled TLS still FAILS", hit(r, "tls-verify-disabled").length === 1 && r.code === 1);
r = run({ "src/a.js": 'const key = process.env.API_KEY;' });
check("regression: a clean file still PASSES", r.findings.length === 0 && r.code === 0);

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
console.log("Both directions proven for every rule.\n");
