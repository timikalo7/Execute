---
name: pre-publish-audit
description: >
  MANDATORY pre-flight before any website goes live. Load and run this whenever a site is about to be
  published, deployed, shipped, launched, pushed to production, connected to a domain, or made public —
  including "publish it", "deploy the site", "go live", "ship it", "point the domain". Runs the SEO /
  GEO audit (vendored claude-seo methodology) alongside Execute's existing gates, and produces a
  prioritized fix list. A site does not go live until this has run.
---

# pre-publish-audit — nothing goes live unaudited

**Owner rule:** run this every time a website is about to be published. Publishing is the moment SEO,
accessibility, and security mistakes become permanent and public — cheap to fix now, expensive after
indexing.

## Order of operations
1. **Build the production artifact** the way it will actually ship (`npm run build`, static export,
   whatever the project uses). Audit the built output, not the dev server.
2. **Run Execute's existing gates first** — they are ship-blockers and they fail the build:
   - `bash .claude/skills/visual-qa/run.sh <project>` — a11y (WCAG AA), overflow, console errors.
   - `node .claude/skills/security-gate/scan.mjs --dir projects/<p>` — secrets, TLS, deps.
   - `node .claude/skills/system-design-gate/check.mjs --dir projects/<p>` — lockfile, `.env.example`,
     SQL interpolation, localStorage tokens, PROJECT-LOG.
   - E-commerce site? `memory/ecommerce-guidelines.md` applies as a ship-blocker too.
3. **Run the SEO / GEO audit** — see below.
4. **Write the findings** into the project's `LAUNCH-CHECKLIST.md` as a prioritized list (blocking /
   should-fix / nice-to-have), fix the blocking ones, then publish.

## The SEO / GEO audit
The methodology lives in **`.claude/skill-library/claude-seo/`** (vendored from `AgricIDaniel/claude-seo`,
MIT — 25 sub-skills + 18 sub-agent playbooks). Read the relevant playbook and apply it with Execute's
own tools (`WebFetch`, `crawl-site`, `browser-drive`, `visual-qa`, Lighthouse).

Minimum sweep before any publish — read the matching playbook in `skill-library/claude-seo/skills/`:
| Area | Playbook | Check |
|---|---|---|
| Technical | `seo-technical` | crawlability, indexability, robots.txt, canonical tags, no accidental `noindex`, redirects, HTTPS |
| On-page | `seo-page` | one `<h1>`, heading order, title + meta description per page, descriptive link text |
| Schema | `seo-schema` | valid Schema.org JSON-LD for the page type (Organization, LocalBusiness, Product, Article, FAQ) |
| Sitemap | `seo-sitemap` | `sitemap.xml` + `robots.txt` present, correct, submitted |
| Content | `seo-content` | E-E-A-T signals, real substance, no thin/duplicate pages |
| Images | `seo-images` | alt text on every meaningful image, sized/optimized (webp), lazy-loaded below the fold |
| **GEO / AEO** | `seo-geo` | answerable question-shaped content, citable claims, clean semantic HTML, `llms.txt` — so AI answer engines (ChatGPT, Perplexity, AI Overviews) can cite the site |
| Local | `seo-local`, `seo-maps` | NAP consistency, LocalBusiness schema, Google Business Profile (local/church/venue sites) |
| E-commerce | `seo-ecommerce` | Product schema, variants, breadcrumb, faceted-nav indexation control |
| Performance | `seo-technical` | Core Web Vitals incl. INP; verify with Lighthouse, not by eye |
| International | `seo-hreflang` | hreflang pairs if multi-region (see the e-commerce multi-region rule) |

Also confirm the basics that get forgotten: favicon, OG/Twitter card image, 404 page, `<html lang>`,
custom domain + HTTPS, analytics installed, and no staging/test content or placeholder copy left.

## Honest limits of the vendored copy
Only **markdown** was vendored (per Execute's supply-chain rule): the installers (`install.sh`,
`install.ps1`), `hooks/`, `bin/`, and the Python `extensions/` (DataForSEO, Firecrawl, Ahrefs, Banana,
SE Ranking, Bing Webmaster, unlighthouse) were **not** vendored and are not run. So:
- The **analysis methodology, checklists, and agent playbooks work** — that is the valuable part.
- Any step whose instructions say to run a bundled script (`claude-seo run <script.py>`), or that needs
  a paid API extension, **does not run here**. Do the equivalent with Execute's own tools, or note it
  as not-checked — never report a skipped check as a pass (`memory/agent-graph-engineering.md`).
- To use the full plugin with its scripts, install it properly from its repo in an interactive session
  — that is where its hooks and installers belong, not vendored into this repo.

## Output
A `LAUNCH-CHECKLIST.md` entry with: what was checked, what failed, the prioritized fix list, and what
could not be verified here. Blocking findings are fixed before publish. Log the pass in
`PROJECT-LOG.md`. After launch, wire `site-watchdog` for ongoing uptime/TLS/header monitoring.
