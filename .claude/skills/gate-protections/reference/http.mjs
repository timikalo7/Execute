/**
 * Protection for `system-design-gate: fetch-no-timeout` and `security-gate: insecure-http`
 * / `tls-verify-disabled`.
 *
 * A `fetch` with no timeout can hang for as long as the other side keeps the socket open.
 * One hung call in a request handler holds a connection; a few thousand hold the service.
 */
export class HttpError extends Error {
  constructor(reason, status) { super(reason); this.name = "HttpError"; this.reason = reason; this.status = status; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param allowInsecure  explicit opt-in for http:// — so plaintext is a decision with a
 *                       name, not something that slips through in a config string.
 */
export async function fetchSafe(url, {
  timeoutMs = 10_000, retries = 2, backoffMs = 250, allowInsecure = false, fetchImpl = fetch, ...init
} = {}) {
  const u = new URL(url);
  if (u.protocol !== "https:" && !allowInsecure) {
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) {
      // localhost over http is not a network hop; allowed without ceremony.
    } else {
      throw new HttpError(`refusing plaintext ${u.protocol}//${u.hostname} — pass allowInsecure to override`);
    }
  }

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    // An explicit controller rather than `AbortSignal.timeout(ms)`. Measured, not
    // assumed: AbortSignal.timeout uses an UNREF'd timer, so when the pending fetch is
    // the only thing left on the event loop the process exits and the abort never fires
    // — the request neither completes nor times out. An owned timer also gets CLEARED on
    // success, instead of leaving one pending per call.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
    try {
      const res = await fetchImpl(url, { ...init, signal: ac.signal });
      // Retry only what is worth retrying. A 400 will be a 400 next time too.
      if (res.status >= 500 || res.status === 429) {
        if (attempt < retries) { await sleep(backoffMs * 2 ** attempt); continue; }
        throw new HttpError(`upstream ${res.status}`, res.status);
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError && e.status && e.status < 500 && e.status !== 429) throw e;
      if (attempt >= retries) break;
      // Exponential backoff. Retrying immediately turns one slow upstream into a
      // self-inflicted flood.
      await sleep(backoffMs * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new HttpError(`request failed after ${retries + 1} attempt(s): ${lastErr?.message || lastErr}`);
}

/**
 * The `tls-verify-disabled` rule fires on the two ways people switch certificate checking
 * off — the TLS agent option set to a falsy value, and the Node environment variable that
 * does it process-wide. (Neither is written out here: this file is scanned by the same
 * gate, and a comment containing the literal is still a line containing the literal.)
 * Both turn every HTTPS call into a plaintext call with extra steps.
 *
 * The legitimate need behind them is almost always "we are behind a proxy with its own
 * CA" — which is THIS container. The correct answer is to TRUST that CA, not to stop
 * checking: `NODE_EXTRA_CA_CERTS=/path/ca-bundle.crt` (already set here), or per-request
 * `ca:` on the agent. Verification stays on; one more issuer becomes acceptable.
 */
export const TLS_GUIDANCE = "NODE_EXTRA_CA_CERTS=<bundle> — trust the CA, never disable verification";
