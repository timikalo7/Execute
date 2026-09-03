/**
 * A payment webhook that actually verifies.
 *
 * The gate can tell you a handler never verifies. It cannot verify one. This is the
 * thing the gate is looking for.
 *
 * An unverified payment webhook is an endpoint where anyone who knows the URL can post
 * `{"type":"payment.succeeded"}` and get free goods. That is the whole attack, and it is
 * why `security-gate` scores `webhook-unverified` as FAIL rather than WARN.
 *
 * Four things are load-bearing and three of them are routinely got wrong:
 *   1. Verify the RAW body. Once a JSON body has been parsed and re-serialised, key order
 *      and whitespace have changed and the signature will never match — the usual "fix"
 *      is to stop verifying, which is how handlers end up unverified.
 *   2. Compare in CONSTANT TIME. `===` on a signature leaks its length and content by
 *      timing. `crypto.timingSafeEqual` exists for this.
 *   3. Bound the TIMESTAMP. Without it a captured valid request replays forever.
 *   4. Reject when the header is MISSING. Absent must never mean "skip the check".
 */
import crypto from "node:crypto";

export class WebhookError extends Error {
  constructor(reason) { super(reason); this.name = "WebhookError"; this.reason = reason; }
}

/**
 * @param rawBody  Buffer|string — the bytes as received. NOT a parsed object.
 * @param header   the signature header, Stripe shape: "t=1690000000,v1=<hex>"
 * @param secret   the endpoint's signing secret, from the environment
 * @param toleranceSec  how old a request may be (default 5 minutes, Stripe's own default)
 */
export function verifyWebhook(rawBody, header, secret, { toleranceSec = 300, now = Date.now() } = {}) {
  if (!secret) throw new WebhookError("no signing secret configured");
  // Absent is a rejection, never a bypass. This is the single most common real hole.
  if (!header) throw new WebhookError("missing signature header");
  if (typeof rawBody !== "string" && !Buffer.isBuffer(rawBody)) throw new WebhookError("body must be raw bytes, not a parsed object");

  const parts = Object.fromEntries(
    String(header).split(",").map((kv) => kv.split("=").map((x) => x.trim())).filter((p) => p.length === 2),
  );
  const ts = Number(parts.t);
  const sig = parts.v1;
  if (!Number.isFinite(ts) || !sig) throw new WebhookError("malformed signature header");

  const ageSec = Math.abs(now / 1000 - ts);
  if (ageSec > toleranceSec) throw new WebhookError("timestamp outside tolerance (replay)");

  const signed = `${ts}.${Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(signed, "utf8").digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(sig), "utf8");
  // timingSafeEqual throws on a length mismatch, so the length check comes first — and
  // a wrong length is a wrong signature either way.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new WebhookError("signature mismatch");

  return JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody);
}

/** Sign a payload the same way, so tests can produce a genuinely valid request. */
export function signWebhook(rawBody, secret, { now = Date.now() } = {}) {
  const t = Math.floor(now / 1000);
  const v1 = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest("hex");
  return `t=${t},v1=${v1}`;
}

/**
 * Next.js App Router shape. `req.text()` gives the raw body; `req.json()` does NOT and
 * is the mistake this comment exists to prevent.
 *
 *   export async function POST(req) {
 *     const raw = await req.text();
 *     try {
 *       const event = verifyWebhook(raw, req.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET);
 *       await handle(event);              // idempotently — retries WILL redeliver
 *       return new Response("ok");
 *     } catch (e) {
 *       // 400, and log the reason server-side only. Never echo it back.
 *       return new Response("invalid", { status: 400 });
 *     }
 *   }
 */
