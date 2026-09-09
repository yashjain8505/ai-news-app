#!/usr/bin/env node
// Pull the day's candidate stories from a fixed list of RSS/Atom feeds plus
// Hacker News, and write them to /tmp/feed-items.json for the gather pass.
//
// WHY THIS EXISTS. Measured 2026-09-09 across 27 days and 678 live daily items:
// the thirteen named daily sources supplied ~11% of the section. The Verge gave
// 1 item, Ars Technica 0, Wired 1, Rest of World 0. The other ~89% was whatever
// WebSearch happened to return - which is dominated by SEO-optimised "AI news
// roundup" pages, because those are engineered to rank for precisely the query
// the curator runs.
//
// The cause is mechanical, not editorial. The curator runs `claude -p`, so it
// discovers pages with WebFetch, and WebFetch is hard-blocked from theverge.com,
// arstechnica.com, wired.com, theguardian.com and reddit.com ("Claude Code is
// unable to fetch from ..."), while Bloomberg, Reuters, NYT, WSJ and The
// Information return 401/403 to bots. Roughly four of thirteen sources were
// reachable at all, so the model fell back to search and search gave it farms.
//
// Every one of those blocked domains returns 200 to plain curl with a browser
// user-agent. So discovery moves here, into the workflow, where the fetch is a
// normal HTTP request: the model then CHOOSES from a pool it did not have to
// find. You can only pick what was ingested, which removes the content-farm
// class outright rather than asking a prompt to resist it.
//
// Deliberately dependency-free: this runs in Actions before `npm i` of anything.

import { writeFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// Only stories published inside the curator's window are candidates. Falls back
// to 24h, matching the gather prompt.
const SINCE = Date.parse(process.env.GATHER_SINCE || "") || Date.now() - 24 * 3600_000;
const MAX_PER_FEED = 12;
const FETCH_TIMEOUT_MS = 20_000;

// Tiered by how often the feed carries something this reader wants. `core` is
// every run; `wide` broadens the pool; `beat` is the trade press where AI stops
// being a product and becomes a line item in someone's budget - the richest
// source of the "surprising consequence" stories the taste brief asks for.
const FEEDS = [
  // --- core: reachable only from here, and the best taste match on the list ---
  ["The Verge", "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", "core"],
  ["Ars Technica", "https://arstechnica.com/ai/feed/", "core"],
  ["Wired", "https://www.wired.com/feed/tag/ai/latest/rss", "core"],
  ["404 Media", "https://www.404media.co/rss/", "core"],
  ["The Register", "https://www.theregister.com/software/ai_ml/headlines.atom", "core"],
  ["The Decoder", "https://the-decoder.com/feed/", "core"],
  ["TechCrunch", "https://techcrunch.com/category/artificial-intelligence/feed/", "core"],
  ["Techmeme", "https://www.techmeme.com/feed.xml", "core"],
  ["Simon Willison", "https://simonwillison.net/tags/ai.atom", "core"],

  // --- wide: applied, non-US, and consequence-heavy ---
  ["Rest of World", "https://restofworld.org/feed/latest/", "wide"],
  ["The Guardian", "https://www.theguardian.com/technology/artificialintelligenceai/rss", "wide"],
  ["The Markup", "https://themarkup.org/feeds/rss.xml", "wide"],
  ["MIT Technology Review", "https://www.technologyreview.com/topic/artificial-intelligence/feed/", "wide"],
  ["Transformer", "https://www.transformernews.ai/feed", "wide"],
  ["Understanding AI", "https://www.understandingai.org/feed", "wide"],
  ["The Next Web", "https://thenextweb.com/feed", "wide"],
  ["Nieman Lab", "https://www.niemanlab.org/feed/", "wide"],

  // --- beat: where AI becomes somebody's budget line or legal problem ---
  ["STAT", "https://www.statnews.com/category/health-tech/feed/", "beat"],
  ["Government Technology", "https://www.govtech.com/index.rss", "beat"],
  ["Insurance Journal", "https://www.insurancejournal.com/news/national/feed/", "beat"],
  ["AgFunderNews", "https://agfundernews.com/feed", "beat"],
  ["The Intercept", "https://theintercept.com/feed/?rss", "beat"],
  ["ProPublica", "https://www.propublica.org/feeds/propublica/main", "beat"],
  ["Bar and Bench", "https://www.barandbench.com/feed", "beat"],
  ["netzpolitik.org", "https://netzpolitik.org/feed/", "beat"],
];

// Farms and rolling index pages, mirroring taste-gate.mjs. A feed can syndicate
// them, so filter here too rather than relying on the gate to clean up after.
const JUNK_DOMAIN =
  /(^|\.)(techstartups\.com|skycrumbs\.com|imfounder\.com|aiweekly\.co|aiagentstore\.ai|releasebot\.io|unite\.ai|eesel\.ai|enterprisedna\.co|marktechpost\.com|dataconomy\.com|technology\.org|artificialintelligence-news\.com|pymnts\.com|latestly\.com|techtimes\.com|aibusinessweekly\.net|outsourceaccelerator\.com)$/i;
const ROLLING_INDEX =
  /\/(ai-news-today|ai-agent-news|this-week|this-month|today|latest|updates|roundup|news|blog|feed|index)\/?$/i;

const AI_RE =
  /\b(ai|a\.i\.|artificial intelligence|machine learning|llm|chatbot|genai|generative|neural|openai|anthropic|deepmind|gemini|claude|chatgpt|copilot|agentic|agents?|model|deepfake|algorithm)\b/i;

function decode(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
};

// Atom puts the URL in an attribute; RSS puts it in the element body.
function linkOf(block) {
  const href = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)/i)
    || block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (href) return decode(href[1]);
  return tag(block, "link") || tag(block, "guid");
}

function itemsOf(xml) {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  return blocks.map((b) => ({
    title: tag(b, "title"),
    url: linkOf(b),
    summary: (tag(b, "description") || tag(b, "summary") || "").slice(0, 400),
    published:
      tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date"),
  }));
}

async function get(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/xml, */*" },
    });
    if (!r.ok) return { err: `HTTP ${r.status}` };
    return { body: await r.text() };
  } catch (e) {
    return { err: e.name === "AbortError" ? "timeout" : String(e.message || e) };
  } finally {
    clearTimeout(t);
  }
}

function usable(it) {
  if (!it.title || !it.url || !/^https?:\/\//i.test(it.url)) return false;
  let u;
  try {
    u = new URL(it.url);
  } catch {
    return false;
  }
  if (JUNK_DOMAIN.test(u.hostname.replace(/^www\./, ""))) return false;
  if (ROLLING_INDEX.test(u.pathname)) return false;
  const ts = Date.parse(it.published);
  // Undated entries are kept: some feeds omit dates, and the gather pass still
  // has to confirm the date on the page itself.
  if (ts && ts < SINCE) return false;
  return true;
}

const main = async () => {
  console.log(`window starts ${new Date(SINCE).toISOString()}`);
  const results = await Promise.all(
    FEEDS.map(async ([source, url, tier]) => {
      const { body, err } = await get(url);
      if (err) return { source, tier, err, items: [] };
      const all = itemsOf(body);
      const items = all
        .filter(usable)
        .filter((it) => AI_RE.test(`${it.title} ${it.summary}`))
        .slice(0, MAX_PER_FEED)
        .map((it) => ({ ...it, source, tier }));
      return { source, tier, got: all.length, items };
    })
  );

  const seen = new Set();
  const out = [];
  for (const r of results) {
    const label = r.err ? `ERR ${r.err}` : `${r.items.length}/${r.got}`;
    console.log(`  ${String(label).padEnd(12)} ${r.source}`);
    for (const it of r.items) {
      const key = (() => {
        try {
          const u = new URL(it.url);
          return u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/+$/, "");
        } catch {
          return it.url;
        }
      })().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(it);
    }
  }

  const dead = results.filter((r) => r.err).map((r) => `${r.source}(${r.err})`);
  writeFileSync("/tmp/feed-items.json", JSON.stringify(out, null, 1));
  console.log(`\nFEED CANDIDATES: ${out.length} from ${results.length - dead.length}/${results.length} feeds`);
  if (dead.length) console.log(`unreachable: ${dead.join(", ")}`);
  // Never fail the curator on a feed outage - the gather pass can still search.
  if (!out.length) console.log("::warning::no feed candidates; gather will fall back to search");
};

main().catch((e) => {
  console.log(`::warning::feed fetch failed: ${e.message}`);
  writeFileSync("/tmp/feed-items.json", "[]");
});
