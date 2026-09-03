# System-design patterns — "when you build X, here's the battle-tested shape"

General, provider-agnostic reference (owner-curated). Pair with `system-design-security-checklist.md`.
When a build matches one of these shapes, start from the final version here — don't re-derive the naïve one.

## Transport: gRPC on HTTP/2 (internal service↔service)
gRPC doesn't replace HTTP — it runs **on HTTP/2** to make backend-to-backend calls fast.
- HTTP/1.1 pain: text-heavy header bloat + **head-of-line blocking** (one slow request stalls the TCP conn).
- HTTP/2 fixes it with **multiplexing** — many concurrent streams over one persistent connection.
- gRPC adds: **binary Protocol Buffers** (not JSON) + a **`.proto` contract** that **codegens** client & server,
  turning network calls into typed **RPCs** that read like local function calls.
- **Use for:** high-performance *internal* microservice comms (typed contracts, low latency). **Not** the
  default for public browser-facing APIs (use REST/JSON or gRPC-web/Connect there).

## Payments (charge a card, reliably)
Build it as an **event-sourced ledger**, not a mutable status field.
1. **Idempotency key** — client generates a UUID per payment attempt and sends it. Server stores the key
   **before** calling the processor; a repeat key returns the stored result instead of charging again
   (kills duplicate charges from retries/timeouts).
2. **Immutable ledger** — every state change is a **new append-only row** (`initiated`, `authorized`,
   `captured`, `refunded`, `disputed`…). **Derive current state from the full timeline**, never overwrite a
   single `status` row (that throws away the audit trail and breaks on out-of-order events).
3. **Webhooks for async truth** — auth/capture/refund/dispute arrive seconds-to-months later. On each: verify
   the **signature**, **dedupe by event id**, append a ledger row. Server never blocks waiting on the processor.

## Caching (read-through cache in front of a DB)
1. **Read-through + TTL + invalidation** — on miss, load from DB and write to cache; expire via TTL **and**
   explicitly delete the key on write so stale data doesn't linger.
2. **Defend the cache-stampede / hot-key collapse** — when a hot key expires, thousands of requests miss at
   once and slam the DB (the cache that protected it just took it down). Mitigate with:
   - **Single-flight** — only the first request rebuilds the key; the rest wait for it.
   - **TTL jitter** — add a random few seconds so keys don't all expire on the same tick.
   - **Hot-key replication** — replicate a very hot key across nodes and spread the reads.

## Webhook / event delivery at scale (you → customers, millions/day)
1. **Write-first, send-later (transactional outbox)** — persist the event durably **before** trying to send;
   a separate worker reads pending events and posts them. Never post inline from request handlers.
2. **Per-tenant fairness lanes** — a dispatcher tracks in-flight per customer; if one customer is slow/at
   limit it's skipped for now so one bad endpoint can't starve everyone else's delivery.
3. **Retry with backoff + fail-fast** — short timeout; retry transient failures with increasing backoff;
   **fail fast** on clearly-permanent errors (bad URL). After the last retry → **dead-letter queue**.
4. **DLQ + replay UI** — failed events aren't lost; they surface in a dashboard for support/customer to
   **replay**.
5. **Sign every delivery (HMAC)** — so the receiver can verify it really came from you (and dedupe by id).

## Sharding / horizontal data partitioning (when one DB node can't hold the load)
Sharding = splitting one logical dataset across many physical nodes so writes/storage scale past a single
box. It is powerful and **expensive in complexity** — do it last, not first.

1. **Exhaust the cheaper ladder first.** In order: add indexes + fix N+1 → **read replicas** (scales reads)
   → **vertical scale** (bigger box) → **table partitioning** (one node, many partitions) → **caching**
   (see above) → **only then shard**. Sharding is the last rung; most apps never need it. Premature
   sharding buys you distributed-systems pain for load you don't have.
2. **Pick the shard key deliberately — it's the one hard-to-reverse decision.** Choose a key that (a)
   spreads load evenly, (b) is present on almost every query so you can route to one shard, and (c) keeps
   related rows that are read together on the **same** shard (e.g. shard by `tenant_id`/`user_id` so all of
   one tenant's data co-locates). A bad key = hot shards + constant cross-shard queries.
3. **Strategy:** **hash-based** (hash the key → even spread, but range scans fan out) vs **range-based**
   (ordered, good for time ranges, but risks a hot "latest" shard) vs **directory/lookup** (a mapping
   service says which shard — flexible, adds a lookup + a single point to protect). Default to hash on a
   high-cardinality key unless you truly need ordered ranges.
4. **Plan rebalancing before you need it.** Naïve `hash % N` reshuffles almost everything when you add a
   node. Use **consistent hashing** or many **virtual buckets** mapped to physical nodes, so growing the
   cluster moves a small slice, not the world.
5. **Cross-shard operations are the tax.** A query without the shard key must **scatter-gather** (hit all
   shards, merge) — slow; avoid on hot paths. **No cross-shard joins/transactions** for free — denormalize,
   duplicate the small dimension onto each shard, or coordinate at the app layer (sagas). Unique constraints
   and auto-increment IDs stop working globally — use UU/ULID/Snowflake IDs generated app-side.
6. **Hot shard / celebrity problem.** One tenant/key far larger than the rest overloads its shard. Detect
   skew, and split or dedicate a shard for the whale; combine with the hot-key cache defenses above.
7. **Reach for the tool before hand-rolling.** Managed/native sharding (Vitess, Citus/Postgres,
   CockroachDB, MongoDB sharding, or a serverless DB that partitions for you) beats a bespoke sharding layer
   — hand-rolled resharding + cross-shard consistency is where teams lose months.
8. **Operational reality:** every shard needs its own backups, replicas, monitoring, and migration runs;
   schema changes now fan out N times. Budget the ops cost, not just the code.

*Shard for write/storage scale you can measure, not scale you imagine. If you're asking "should I shard?",
the answer is usually "not yet — climb the ladder in #1 first."*

## Server-authoritative state (real-time, multiplayer, anything with a score or a balance)
The client renders and sends *intent*; the **server owns the truth**. This is the stateful cousin of
"never trust the client" — it matters wherever a client could gain by lying: games, collaborative
editing, live dashboards, anything with points, inventory, or money.
1. **Clients send intent, not results.** "I pressed left", "I want to buy item X" — never "my score is
   now 9000" or "my balance is £500". The server computes the outcome and broadcasts it.
2. **Validate every action server-side against the server's own state** — is this move legal *now*,
   does this player actually hold that item, is the cooldown elapsed? A UI that hides a button is not
   a control.
3. **Reconcile, don't fight.** Clients may predict locally for responsiveness, but the server's
   snapshot wins; on mismatch the client re-bases to the authoritative state. Send periodic full
   snapshots alongside deltas so a dropped message cannot desync a client forever.
4. **Rate-limit and sanity-check per connection** — impossible action rates, teleports, and
   out-of-order sequence numbers are the cheating signal; log and reject them.
5. **Server time is the clock.** Never trust client timestamps for anything that decides an outcome.

## Schema change without downtime (expand → contract, a.k.a. parallel change)
Never rename/retype/drop a column in one shot on a live system: the old code is still running during
deploy, and an in-place change breaks it the moment the migration lands. Split every breaking schema
change into additive steps that are each safe on their own, deployed in this order:
1. **Expand — add the new column** (nullable, no default backfill on a big table). Purely additive:
   old code ignores it, nothing breaks.
2. **Dual-write** — deploy code that writes **both** old and new columns on every insert/update. Reads
   still come from the old column. Now every *new* row is correct in both places.
3. **Backfill** the historical rows **in batches** (thousands at a time, with a pause), not one giant
   `UPDATE` — a single statement locks the table and blows up replication lag. Make it resumable and
   idempotent so it can be re-run after a failure.
4. **Switch reads** to the new column and deploy. Old column is still written, so this step is
   instantly revertible — this is the safety net, don't skip it.
5. **Contract — stop writing the old column**, let it sit unused for a release, then **drop it**.
Dropping is the only irreversible step, so it goes last and alone.

**Rules that go with it**
- **Migrations are code**: versioned files in the repo, applied by a tool (Prisma/Drizzle/Alembic/
  Flyway), reviewed in the PR — not typed into a dashboard SQL editor. Clicking around a hosted console
  leaves no history, no review, and no way to reproduce the change in another environment.
- **Never edit a migration that has already been applied** anywhere. Write a new one — editing history
  desynchronises every environment that already ran it.
- **Every migration needs a tested rollback**, and expand/contract is what makes rollback possible.
- **Deploy order matters:** additive migration first, then code. Destructive migration last, after the
  code that stopped using the column is fully rolled out.
- **Watch for lock-heavy operations** — adding an index (`CREATE INDEX CONCURRENTLY` on Postgres),
  adding a `NOT NULL` with a default on a large table, or changing a column type can lock writes.
  Check the specific database's behaviour before running it against production volume.
- Same shape applies beyond columns: renaming a table, splitting one table into two, or changing an
  API response — add the new, write both, migrate readers, remove the old.

## Rate limiting (pick the algorithm deliberately — they are not equivalent)
Execute's hard rules say "rate-limit every API". This is *how*. Choose by the failure you care about.

| Algorithm | State per key | Behaviour | Use when |
|---|---|---|---|
| **Fixed window** | 1 counter + minute | simplest; **allows a 2× burst across the boundary** | internal/low-stakes only |
| **Sliding window log** | timestamp per request | exact, no burst | low volume, precision matters |
| **Sliding window counter** | 2 counters | ~exact, cheap — weights the previous window | **the sane default for APIs** |
| **Token bucket** | tokens + last-refill | allows a controlled burst up to capacity, then steady refill | user-facing APIs where bursts are legitimate |
| **Leaky bucket** | queue + drain rate | smooths output to a constant rate | protecting a fragile downstream |

1. **The fixed-window trap.** A 100/min counter that resets on the minute lets a client send 100 at
   12:00:59 and 100 at 12:01:00 — **200 requests in one second** while never "exceeding" the limit.
   That is why the naive implementation everyone writes first is the wrong one.
2. **Token bucket is usually the right user-facing choice** (`capacity` = burst allowance,
   `refill rate` = sustained rate). Store `{tokens, lastRefillAt}` and refill lazily on read —
   `tokens = min(capacity, tokens + (now - lastRefillAt) * rate)` — no background timer needed.
3. **Distributed = must be atomic.** Read-then-write across processes races and silently over-admits.
   Use a single atomic operation: a Redis Lua script, `INCR` + `EXPIRE` in one round trip, or the
   provider's native limiter. An in-memory limiter is per-instance — behind N replicas the real limit
   is N× what you configured. Say so in the code comment.
4. **Key on identity, not IP alone.** Prefer user/API-key/tenant; IP alone punishes shared NATs and is
   trivially rotated. Layer limits: per-user AND per-IP AND global. Different costs get different
   buckets — a login attempt, a search, and an LLM call must not share one limit.
5. **Answer correctly.** Return **`429`** with **`Retry-After`**, and expose `RateLimit-Limit`,
   `RateLimit-Remaining`, `RateLimit-Reset` so clients can self-regulate. Never fail silently, never
   return 200 with a partial result.
6. **Fail open or closed — decide, don't default.** If the limiter's store is down: fail **closed**
   for auth, payments and anything spend-bound (an outage must not become a free-for-all); fail
   **open** for read-only endpoints where availability matters more.
7. **Cost-based limiting for AI/LLM endpoints.** Requests-per-minute does not bound spend — one
   request can cost 1000× another. Bound **tokens/compute per user per period** as well, per the
   hard build rules. This is the cost-DoS defence.
8. **Related but distinct:** *throttling* (slow down), *quota* (long-period budget), *load shedding*
   (drop work under overload), *backpressure* (tell the producer to slow). A rate limit does not
   replace a circuit breaker or a timeout on the downstream call.

## Session cookies — picking `SameSite`, and the flags that go with it
The checklists already say "set HttpOnly/Secure/SameSite". This is *which value* and *why*, because
the wrong choice either breaks login or leaves CSRF open.

| `SameSite` | Sent on cross-site requests? | Cost |
|---|---|---|
| **`Strict`** | never — not even a top-level link from another site | user clicking your link **in an email or Google lands logged-out**; the session cookie isn't sent on that first navigation |
| **`Lax`** | only on **top-level GET** navigations; never on cross-site POST/iframe/XHR | **the sane default for session cookies** — kills classic form-POST CSRF while keeping inbound links working |
| **`None`** | always — **requires `Secure`** | needed for genuine cross-site use (embedded iframe, third-party widget, separate API origin). Reopens CSRF: you now need tokens/origin checks |

1. **Default to `Lax`** for session cookies. Reach for `Strict` only on genuinely high-value cookies
   where the logged-out-from-email behaviour is acceptable (banking-style admin), and expect the
   support tickets. A common pattern is two cookies: a `Strict` one gating sensitive actions, a `Lax`
   one for general session continuity.
2. **`SameSite` is a mitigation, not the control.** It is browser-dependent and does nothing for
   same-site attacks. **Cookie-based auth still needs CSRF protection** on state-changing requests —
   a token (double-submit or synchroniser) or a strict `Origin`/`Sec-Fetch-Site` check. Do not treat
   `SameSite=Lax` as "CSRF handled".
3. **The full flag set on any session cookie:** `HttpOnly` (JS cannot read it — this is what makes a
   cookie safer than `localStorage` under XSS), `Secure` (HTTPS only), `SameSite`, a narrow `Path`,
   and **no `Domain`** unless subdomains genuinely need it (setting `Domain=.example.com` hands the
   cookie to every subdomain, including a compromised one). Prefix with `__Host-` when you can — the
   browser then enforces `Secure`, no `Domain`, and `Path=/`.
4. **Never put tokens in `localStorage`** — any XSS exfiltrates them, and there is no `HttpOnly`
   equivalent. This is already a blocking rule in `system-design-gate`.
5. **Rotate the session ID on privilege change** (login, role change, password reset) to kill session
   fixation, and make logout invalidate server-side — deleting the cookie alone leaves a valid session
   for anyone who captured it.
6. **CORS is a separate control.** `Access-Control-Allow-Origin` does not stop a form POST, and
   `credentials: 'include'` with a wildcard origin is rejected by browsers. Getting CORS right does
   not mean CSRF is handled, and vice versa.

---
*Add new shapes here as they're learned. Keep them general and reusable.*
