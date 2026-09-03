/**
 * Protection for `system-design-gate: token-in-localstorage`.
 *
 * `localStorage` is readable by any JavaScript on the origin. One XSS — one bad
 * dependency, one `.innerHTML` of user text — and the token leaves with the attacker.
 * A cookie marked httpOnly is not readable by JavaScript at all, so the same XSS cannot
 * take it.
 *
 * ORDER OF PREFERENCE:
 *   1. **httpOnly + Secure + SameSite cookie**, set by the server. The browser attaches
 *      it; your JS never sees it and therefore cannot leak it.
 *   2. **Access token in MEMORY, refresh token in an httpOnly cookie.** For an SPA that
 *      must send an Authorization header. A page reload loses the access token and the
 *      refresh cookie silently gets a new one — that is the design, not a bug.
 *   3. `localStorage` — only for things that are not credentials. A theme, a collapsed
 *      panel, an unsent draft.
 */
export class TokenError extends Error {
  constructor(reason) { super(reason); this.name = "TokenError"; this.reason = reason; }
}

/** Option 1: the Set-Cookie a server should emit. SameSite=Lax survives normal
 *  navigation while still refusing the cross-site POST that CSRF depends on. */
export function sessionCookie(name, value, { maxAgeSec = 60 * 60 * 8, sameSite = "Lax", path = "/", domain } = {}) {
  if (!name || !value) throw new TokenError("cookie needs a name and a value");
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${maxAgeSec}`,
    `Path=${path}`,
    "HttpOnly",   // JS cannot read it — the whole point
    "Secure",     // never sent over plaintext
    `SameSite=${sameSite}`,
  ];
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join("; ");
}

/**
 * Option 2: an in-memory access-token store for an SPA.
 *
 * Deliberately has NO persistence method. There is nowhere to write it, so nobody can
 * "just" persist it later under deadline — the safety is structural rather than a
 * convention someone has to keep.
 */
export function createTokenStore() {
  let token = null;
  let expiresAt = 0;
  return {
    set(t, ttlSec) {
      if (!t) throw new TokenError("empty token");
      token = t;
      expiresAt = Date.now() + ttlSec * 1000;
    },
    get() {
      // Expiry is enforced on read, so a stale token is never handed out even if a
      // refresh timer was missed.
      if (!token || Date.now() >= expiresAt) return null;
      return token;
    },
    clear() { token = null; expiresAt = 0; },
    get isPersisted() { return false; },
  };
}

/** Option 3's guard: refuse to put anything credential-shaped in web storage. */
const CREDENTIAL_KEY = /(token|jwt|auth|session|secret|key|password|bearer|credential)/i;
export function safeLocalStorageSet(key, value, storage) {
  if (CREDENTIAL_KEY.test(String(key))) throw new TokenError(`refusing to put "${key}" in web storage — use an httpOnly cookie`);
  if (typeof value === "string" && /^ey[A-Za-z0-9_-]{10,}\./.test(value)) throw new TokenError("that value looks like a JWT — not in web storage");
  storage.setItem(key, value);
  return true;
}
