---
name: crawl-site
description: >
  Crawl a whole website (docs, competitor site, reference) into local markdown files you can Read —
  not just one page. Use when research needs many pages from one site: "crawl", "scrape the site",
  "read their whole docs", competitor teardown, migrating content, mining a reference site beyond a
  single URL (WebFetch is per-page; this walks the site). Keyless by default; uses Firecrawl
  automatically when FIRECRAWL_API_KEY is set.
---

# crawl-site — whole-site crawling with a keyless default

One command, two backends chosen automatically:

```bash
node .claude/skills/crawl-site/crawl.mjs <start-url> --max-pages 30 --out /tmp/crawl [--include /docs]
```

- **Keyless (default)** — built-in BFS crawler: plain fetch, same-origin link walk, HTML→text
  extraction, one `.md` per page + `index.json` manifest. No JS rendering — right for static/SSR
  sites (most marketing/docs targets). PROVEN 2026-07-07 on docs.expo.dev through the agent proxy.
- **Firecrawl (keyed)** — set `FIRECRAWL_API_KEY` and the same command routes to the Firecrawl v1
  crawl API instead: JS rendering, clean markdown. Key: firecrawl.dev → dashboard → API keys
  (credit-gated — check the balance before a big crawl, per the credit-management rule).

## Workflow
1. Crawl with a bounded `--max-pages` (default 30; raise deliberately, never unbounded).
2. Read `index.json` first — titles + char counts tell you which pages matter.
3. Read the specific `.md` files you need; don't bulk-load every page into context.
4. `--include /path` limits the walk to a section (e.g. `--include /docs` skips the marketing pages).

## Notes / limits
- Keyless backend does no JS rendering — a JS-only SPA yields empty text; that's the signal to use
  the Firecrawl backend (or Playwright via the browser-drive skill for one-off dynamic pages).
- Same-origin only by design; it will not follow external links.
- Be a polite crawler: keep `--max-pages` sane, don't hammer small sites, respect obvious signals.
- The extractor is regex-grade (title + text + headings) — good enough to *read*, not a faithful
  DOM parse. For pixel/DOM truth, use Playwright.
