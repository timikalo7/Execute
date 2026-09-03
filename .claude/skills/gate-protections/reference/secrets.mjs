/**
 * Protection for the seven secret rules (`aws-access-key`, `github-token`,
 * `google-api-key`, `slack-token`, `stripe-secret`, `private-key`,
 * `generic-secret-assignment`) and for `system-design-gate: missing-env-example`.
 *
 * Those rules fire on a secret that reached a source file. The protection is a path where
 * it never gets there: read from the environment, fail loudly when absent, and generate
 * the `.env.example` from the same declaration so it can never drift out of date.
 */
export class ConfigError extends Error {
  constructor(reason) { super(reason); this.name = "ConfigError"; this.reason = reason; }
}

/**
 * Declare configuration once.
 *
 *   const cfg = loadConfig({
 *     STRIPE_SECRET_KEY: { required: true,  secret: true,  note: "Stripe dashboard → API keys" },
 *     PORT:              { required: false, default: "3000", note: "http port" },
 *   });
 *
 * Missing required keys throw ALL AT ONCE — one restart tells you everything that is
 * absent, rather than one key per restart.
 */
export function loadConfig(schema, env = process.env) {
  const out = {};
  const missing = [];
  for (const [key, spec] of Object.entries(schema)) {
    const v = env[key];
    if (v === undefined || v === "") {
      if (spec.required) { missing.push(key); continue; }
      out[key] = spec.default ?? null;
      continue;
    }
    out[key] = v;
  }
  if (missing.length) throw new ConfigError(`missing required environment variable(s): ${missing.join(", ")}`);

  // Secrets are non-enumerable, so a stray console.log(cfg) or JSON.stringify(cfg) — in a
  // log line, an error report, a debug endpoint — cannot print them.
  const safe = {};
  for (const [k, v] of Object.entries(out)) {
    if (schema[k]?.secret) Object.defineProperty(safe, k, { value: v, enumerable: false, writable: false });
    else safe[k] = v;
  }
  return Object.freeze(safe);
}

/** Generate `.env.example` from the same schema, so documentation cannot drift. */
export function envExample(schema) {
  const lines = ["# Generated from the config schema — every variable the code reads.", "# Never commit real values. This file holds names and notes only.", ""];
  for (const [key, spec] of Object.entries(schema)) {
    if (spec.note) lines.push(`# ${spec.note}`);
    lines.push(`# ${spec.required ? "REQUIRED" : "optional"}${spec.secret ? " · SECRET — never commit" : ""}`);
    lines.push(`${key}=${spec.secret ? "" : spec.default ?? ""}`, "");
  }
  return lines.join("\n");
}

/** Last line of defence: never let a value that looks like a live secret be logged. */
const SECRET_SHAPE = /\b(sk_live_[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
export function redact(value) {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return String(s).replace(new RegExp(SECRET_SHAPE, "g"), "[REDACTED]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED]");
}
