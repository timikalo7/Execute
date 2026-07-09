#!/usr/bin/env node
// crawl-site — whole-site crawling for Execute.
// Backend 1 (keyed): Firecrawl v1 API when FIRECRAWL_API_KEY is set — JS rendering, clean markdown.
// Backend 2 (keyless): built-in BFS crawler — plain fetch + same-origin link walk. No JS rendering;
// fine for static/SSR sites (most marketing/docs targets).
//
// Usage: node crawl.mjs <start-url> [--max-pages 30] [--out DIR] [--include /docs] [--quiet]
// Output: one .md file per page (title + extracted text) in DIR + an index.json manifest.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--"));
const flag = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
if (!url) {
  console.error("usage: node crawl.mjs <start-url> [--max-pages 30] [--out DIR] [--include /path-prefix]");
  process.exit(2);
}
const MAX = Number(flag("--max-pages", 30));
const OUT = flag("--out", "/tmp/crawl");
const INCLUDE = flag("--include", "");
const QUIET = args.includes("--quiet");
mkdirSync(OUT, { recursive: true });

const KEY = process.env.FIRECRAWL_API_KEY || "";

function slug(u) {
  const p = new URL(u).pathname.replace(/\/+$/, "") || "/index";
  return p.replace(/[^a-zA-Z0-9/_-]/g, "_").replace(/\//g, "__").slice(0, 120);
}

function htmlToText(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() ?? "";
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(h[1-6])[^>]*>/gi, "\n\n## ")
    .replace(/<(p|div|section|article|li|br|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text: s };
}

function extractLinks(html, base) {
  const out = new Set();
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], base);
      u.hash = ""; u.search = "";
      if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, ""); // trailing-slash dupes
      out.add(u.toString());
    } catch {}
  }
  return [...out];
}

async function keylessCrawl() {
  const origin = new URL(url).origin;
  const seen = new Set();
  const queue = [url];
  const manifest = [];
  while (queue.length && manifest.length < MAX) {
    const cur = queue.shift();
    if (seen.has(cur)) continue;
    seen.add(cur);
    let res;
    try {
      res = await fetch(cur, { redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "user-agent": "execute-crawl/1.0" } });
    } catch (e) {
      if (!QUIET) console.error(`fetch failed ${cur}: ${e.message}`);
      continue;
    }
    if (!res.ok || !(res.headers.get("content-type") || "").includes("text/html")) continue;
    const html = await res.text();
    const { title, text } = htmlToText(html);
    const f = join(OUT, slug(cur) + ".md");
    writeFileSync(f, `# ${title || cur}\n\nsource: ${cur}\n\n${text}\n`);
    manifest.push({ url: cur, title, file: f, chars: text.length });
    if (!QUIET) console.log(`crawled ${manifest.length}/${MAX}: ${cur} (${text.length} chars)`);
    for (const l of extractLinks(html, cur)) {
      if (l.startsWith(origin) && !seen.has(l) && (!INCLUDE || new URL(l).pathname.startsWith(INCLUDE))) queue.push(l);
    }
  }
  return manifest;
}

async function firecrawl() {
  const start = await fetch("https://api.firecrawl.dev/v1/crawl", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, limit: MAX, scrapeOptions: { formats: ["markdown"] } }),
  });
  const job = await start.json();
  if (!job.success) throw new Error(`firecrawl start failed: ${JSON.stringify(job).slice(0, 300)}`);
  let status, tries = 0;
  do {
    await new Promise((r) => setTimeout(r, 4000));
    status = await (await fetch(job.url, { headers: { Authorization: `Bearer ${KEY}` } })).json();
    if (++tries > 150) throw new Error("firecrawl poll timeout");
  } while (status.status !== "completed");
  const manifest = [];
  for (const d of status.data ?? []) {
    const src = d.metadata?.sourceURL ?? url;
    const f = join(OUT, slug(src) + ".md");
    writeFileSync(f, `# ${d.metadata?.title ?? src}\n\nsource: ${src}\n\n${d.markdown ?? ""}\n`);
    manifest.push({ url: src, title: d.metadata?.title ?? "", file: f, chars: (d.markdown ?? "").length });
  }
  return manifest;
}

const manifest = await (KEY ? firecrawl() : keylessCrawl()).catch((e) => {
  console.error(String(e));
  process.exit(1);
});
writeFileSync(join(OUT, "index.json"), JSON.stringify({ backend: KEY ? "firecrawl" : "keyless", start: url, pages: manifest }, null, 1));
console.log(`\nbackend: ${KEY ? "firecrawl" : "keyless (no FIRECRAWL_API_KEY — no JS rendering)"}`);
console.log(`pages: ${manifest.length}  |  manifest: ${join(OUT, "index.json")}`);
