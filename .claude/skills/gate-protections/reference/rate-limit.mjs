/**
 * Protection for `system-design-gate: no-rate-limit-reference`, and for the CLAUDE.md hard
 * build rule "rate limiting · per-user token caps on AI features".
 *
 * THE MISTAKE THIS REPO ALREADY MADE, recorded in memory/principles.md: an AI route's
 * rate limit and token cap were keyed on a client-supplied `x-user-key` header. Anyone
 * could change the header and get a fresh budget — a cost-exhaustion DoS wearing a rate
 * limiter. Two rules come out of that and both are enforced here:
 *
 *   1. **Key on something the client cannot choose.** A verified session id, or the
 *      connecting IP. Never a raw request header.
 *   2. **A GLOBAL ceiling as well as a per-key one.** Per-key limits bound one abuser.
 *      Only a global ceiling bounds the BILL, which is the thing that actually hurts.
 */
export class RateLimitError extends Error {
  constructor(reason, retryAfterMs) {
    super(reason);
    this.name = "RateLimitError";
    this.reason = reason;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Token bucket. Smooth, allows a small burst, and costs one map entry per key.
 *
 * @param capacity      burst size
 * @param refillPerSec  sustained rate
 * @param globalCapacity  ceiling across ALL keys (the bill-bounding one)
 */
export function createLimiter({ capacity = 10, refillPerSec = 1, globalCapacity = 200, globalRefillPerSec = 20, now = () => Date.now() } = {}) {
  const buckets = new Map();
  let g = { tokens: globalCapacity, at: now() };

  const refill = (b, cap, rate, t) => {
    const dt = (t - b.at) / 1000;
    b.tokens = Math.min(cap, b.tokens + dt * rate);
    b.at = t;
  };

  return {
    /**
     * @param key   MUST be derived from something verified — a session id or IP.
     * @param cost  1 for a normal request; for an AI route, the estimated token cost, so
     *              one expensive call spends more budget than one cheap call.
     */
    take(key, cost = 1) {
      if (!key) throw new RateLimitError("no rate-limit key — refusing to serve unkeyed", 0);
      const t = now();

      refill(g, globalCapacity, globalRefillPerSec, t);
      if (g.tokens < cost) throw new RateLimitError("global capacity reached", Math.ceil(((cost - g.tokens) / globalRefillPerSec) * 1000));

      let b = buckets.get(key);
      if (!b) { b = { tokens: capacity, at: t }; buckets.set(key, b); }
      refill(b, capacity, refillPerSec, t);
      if (b.tokens < cost) throw new RateLimitError("rate limit exceeded", Math.ceil(((cost - b.tokens) / refillPerSec) * 1000));

      b.tokens -= cost;
      g.tokens -= cost;
      return { remaining: Math.floor(b.tokens), globalRemaining: Math.floor(g.tokens) };
    },
    size: () => buckets.size,
    /** Buckets for keys that have fully refilled are indistinguishable from new ones, so
     *  dropping them is free and stops the map growing without bound. */
    sweep() {
      const t = now();
      for (const [k, b] of buckets) {
        refill(b, capacity, refillPerSec, t);
        if (b.tokens >= capacity) buckets.delete(k);
      }
      return buckets.size;
    },
  };
}

/**
 * Derive a key that the caller cannot forge. `x-forwarded-for` is only trustworthy when
 * your own proxy sets it — behind an untrusted network it is attacker-controlled, which
 * is why a verified session always wins when one exists.
 */
export function limiterKey({ sessionId, ip, trustProxy = false, forwardedFor } = {}) {
  if (sessionId) return `s:${sessionId}`;
  if (trustProxy && forwardedFor) return `ip:${String(forwardedFor).split(",")[0].trim()}`;
  if (ip) return `ip:${ip}`;
  return null; // -> take() refuses. Unkeyed traffic is never served.
}
