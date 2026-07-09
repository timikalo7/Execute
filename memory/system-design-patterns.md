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

---
*Add new shapes here as they're learned. Keep them general and reusable.*
