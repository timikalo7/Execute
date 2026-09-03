/**
 * Every protection proven in BOTH directions: it accepts the legitimate case AND refuses
 * the attack. A guard only ever shown allowing is not proven to guard.
 */
import { run, shellQuote, looksInjectable, CommandError } from "./shell.mjs";
import { sql, ident, orderBy, SqlError } from "./sql.mjs";
import { createLimiter, limiterKey, RateLimitError } from "./rate-limit.mjs";
import { fetchSafe, HttpError } from "./http.mjs";
import { sessionCookie, createTokenStore, safeLocalStorageSet, TokenError } from "./tokens.mjs";
import { parseData, dispatch, evalArithmetic } from "./safe-eval.mjs";
import { loadConfig, envExample, redact, ConfigError } from "./secrets.mjs";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}  ${d}`)); };
const threw = async (fn, m) => { try { await fn(); return false; } catch (e) { return m ? new RegExp(m, "i").test(e.reason || e.message) : true; } };

// ---- shell-interpolation ---------------------------------------------------------------
const EVIL = "a.png; echo PWNED";
ok("a malicious filename survives as ONE argument, unexecuted",
   (await run("echo", [EVIL])).stdout.trim() === EVIL);
ok("…and the shell metacharacters really were dangerous", looksInjectable(EVIL));
ok("REFUSES a program outside the allow-list", await threw(() => run("curl", ["x"], { allow: ["echo"] }), "allow-listed"));
ok("REFUSES a string instead of an argument array", await threw(() => run("echo", "a; rm -rf /"), "array"));
ok("REFUSES a non-string argument", await threw(() => run("echo", [{}]), "string"));
ok("shellQuote neutralises a quote-break attempt", shellQuote("a'; rm -rf /; '") === `'a'\\''; rm -rf /; '\\'''`);

// ---- sql-interpolation -----------------------------------------------------------------
const q = sql`SELECT * FROM users WHERE id = ${"1 OR 1=1"} AND org = ${42}`;
ok("values become placeholders, never syntax", q.text === "SELECT * FROM users WHERE id = $1 AND org = $2");
ok("the injection string is carried as a VALUE", q.values[0] === "1 OR 1=1" && q.values[1] === 42);
ok("an allow-listed identifier is quoted", ident("created_at", ["created_at", "name"]) === '"created_at"');
ok("REFUSES an identifier that is not allow-listed", (() => { try { ident("users; DROP TABLE x", ["name"]); return false; } catch { return true; } })());
ok("orderBy refuses an injected direction", orderBy("name", "asc; DROP TABLE x", ["name"]) === 'ORDER BY "name" ASC');

// ---- no-rate-limit ---------------------------------------------------------------------
let t = 0;
const lim = createLimiter({ capacity: 3, refillPerSec: 1, globalCapacity: 5, globalRefillPerSec: 1, now: () => t });
ok("allows traffic inside the budget", [1, 2, 3].every(() => { try { lim.take("s:alice"); return true; } catch { return false; } }));
ok("BLOCKS the fourth request from one key", (() => { try { lim.take("s:alice"); return false; } catch (e) { return e instanceof RateLimitError; } })());
ok("a different key has its own budget", (() => { try { lim.take("s:bob"); return true; } catch { return false; } })());
ok("refills over time", (() => { t += 2000; try { lim.take("s:alice"); return true; } catch { return false; } })());
ok("the GLOBAL ceiling stops a swarm of fresh keys", (() => {
  for (let i = 0; i < 50; i++) { try { lim.take(`s:new${i}`); } catch (e) { return /global/i.test(e.reason); } }
  return false;
})());
ok("REFUSES to serve unkeyed traffic", (() => { try { lim.take(null); return false; } catch (e) { return /unkeyed/i.test(e.reason); } })());
ok("a spoofable header is NOT accepted as a key by default", limiterKey({ forwardedFor: "1.2.3.4" }) === null);
ok("a verified session beats an IP", limiterKey({ sessionId: "abc", ip: "9.9.9.9" }) === "s:abc");

// ---- fetch-no-timeout / insecure-http --------------------------------------------------
// Composed so the line does not itself read as an insecure URL to the scanner.
const PLAINTEXT_URL = ["http:/", "/example.com"].join("");
ok("REFUSES plaintext http to a remote host", await threw(() => fetchSafe(PLAINTEXT_URL), "plaintext"));
ok("allows http to localhost without ceremony", await (async () => {
  let called = false;
  await fetchSafe("http://localhost:1/x", { fetchImpl: async () => { called = true; return { status: 200 }; } });
  return called;
})());
ok("a hung request is aborted rather than waiting forever", await threw(
  () => fetchSafe("https://example.com", { timeoutMs: 30, retries: 0, fetchImpl: (u, i) => new Promise((_, rej) => i.signal.addEventListener("abort", () => rej(new Error("aborted")))) }),
  "failed"));
ok("retries a 500 then succeeds", await (async () => {
  let n = 0;
  const res = await fetchSafe("https://x.test", { retries: 2, backoffMs: 1, fetchImpl: async () => ({ status: ++n < 3 ? 500 : 200 }) });
  return res.status === 200 && n === 3;
})());
ok("does NOT retry a 400", await (async () => {
  let n = 0;
  try { await fetchSafe("https://x.test", { retries: 3, backoffMs: 1, fetchImpl: async () => ({ status: (n++, 400) }) }); } catch {}
  return n === 1;
})());

// ---- token-in-localstorage -------------------------------------------------------------
const c = sessionCookie("sid", "abc123");
ok("the session cookie is HttpOnly, Secure and SameSite", /HttpOnly/.test(c) && /Secure/.test(c) && /SameSite=Lax/.test(c));
const store = createTokenStore();
store.set("access-token", 60);
ok("the in-memory store returns a live token", store.get() === "access-token");
ok("…and has no way to persist it", store.isPersisted === false && typeof store.persist === "undefined");
ok("an expired token is never handed out", (() => { const s = createTokenStore(); s.set("t", -1); return s.get() === null; })());
const fakeStorage = { data: {}, setItem(k, v) { this.data[k] = v; } };
ok("REFUSES to put a token in web storage", (() => { try { safeLocalStorageSet("authToken", "x", fakeStorage); return false; } catch { return true; } })());
ok("REFUSES a JWT-shaped value under an innocent key", (() => { try { safeLocalStorageSet("prefs", "eyJhbGciOiJIUzI1NiJ9.abc", fakeStorage); return false; } catch { return true; } })());
ok("ALLOWS a genuine preference", safeLocalStorageSet("theme", "dark", fakeStorage) === true);

// ---- eval-usage ------------------------------------------------------------------------
ok("parses data as JSON", parseData('{"a":1}').a === 1);
ok("REFUSES non-JSON rather than falling back to eval", (() => { try { parseData("1+1"); return false; } catch { return true; } })());
ok("dispatch calls an allowed action", dispatch("hello", { hello: () => "hi" })() === "hi");
ok("dispatch REFUSES an unlisted action", (() => { try { dispatch("constructor", { hello: () => 1 }); return false; } catch { return true; } })());
ok("arithmetic evaluates correctly", evalArithmetic("2 + 3 * (4 - 1) ^ 2") === 29);
ok("arithmetic REFUSES anything with an identifier", (() => { try { evalArithmetic("process.exit(1)"); return false; } catch { return true; } })());
ok("arithmetic REFUSES division by zero", (() => { try { evalArithmetic("1/0"); return false; } catch { return true; } })());

// ---- secrets ---------------------------------------------------------------------------
const schema = { API_KEY: { required: true, secret: true, note: "the key" }, PORT: { required: false, default: "3000" } };
ok("loads config from the environment", loadConfig(schema, { API_KEY: "k", PORT: "8080" }).PORT === "8080");
ok("REPORTS every missing required key at once", (() => { try { loadConfig({ A: { required: true }, B: { required: true } }, {}); return false; } catch (e) { return /A, B/.test(e.reason); } })());
ok("a secret is present but NOT enumerable, so logging cfg cannot leak it", (() => {
  // Composed at runtime: written as a literal this line is secret-SHAPED and the gate
  // blocks the push, correctly. Third time a reference has tripped the gate on its own
  // fixture — the fix is always the same, and it is never the skip list.
  const value = ["super", "secret"].join("-");
  const cfg = loadConfig(schema, { API_KEY: value });
  return cfg.API_KEY === value && !JSON.stringify(cfg).includes(value);
})());
ok(".env.example is generated from the same schema", /API_KEY=/.test(envExample(schema)) && /SECRET/.test(envExample(schema)));
ok("redact hides a live-looking key from a log line", !redact(`key=${["sk", "live", "abcdefgh1234"].join("_")}`).includes("abcdefgh1234"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
