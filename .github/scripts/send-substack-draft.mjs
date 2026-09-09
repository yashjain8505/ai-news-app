#!/usr/bin/env node
// Builds the day's edition as a ready-to-paste Substack post and emails it.
//
// Runs right after the daily newsletter goes out, so every send produces a
// matching Substack draft with zero effort: the email lands with the post
// title, the fully formatted body, and a one-click link to /compose (whose
// "Copy post" button puts rich HTML on the clipboard, so pasting into the
// Substack editor keeps headings, bold and links).
//
// Substack has no official write API, and its internal API sits behind
// Cloudflare, which challenges datacenter IPs (i.e. GitHub Actions) even with a
// valid session cookie. So the last step stays manual by design: paste + hit
// Publish. Everything before it is automated.
//
// Structure mirrors the newsletter (Funding, Top Stories, Interesting Articles;
// no Tools) so the two channels tell the same story. The Substack *title* is
// the edition's thematic headline, not the email's news-list subject line, which
// reads better as a post title.
//
// Env:
//   SUPABASE_URL           (default: the project URL below)
//   SUPABASE_SERVICE_KEY   service-role key (CI). A DRY_RUN can use
//                          SUPABASE_ANON_KEY instead (active items are public),
//                          but the ledger write needs the service key.
//   RESEND_API_KEY         (required unless DRY_RUN)
//   SITE_URL               (default https://www.wortins.com)
//   MAIL_FROM              (default 'Wortins <daily@wortins.com>')
//   SUBSTACK_DRAFT_TO      (default earanyash@gmail.com) where the hand-off goes
//   EDITION_DATE           (optional YYYY-MM-DD; default = latest edition)
//   DRY_RUN=1              build + print, send nothing
//   FORCE=1                send even if this edition was already handed off

import { fileURLToPath } from "node:url";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://zrjbzowohsgjbrhsldfi.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SITE_URL = (process.env.SITE_URL || "https://www.wortins.com").replace(/\/$/, "");
const MAIL_FROM = process.env.MAIL_FROM || "Wortins <daily@wortins.com>";
const MAIL_TO = process.env.SUBSTACK_DRAFT_TO || "earanyash@gmail.com";
// The publication's own editor, so the link skips Substack's publication
// picker and lands directly on a blank post.
const SUBSTACK_URL = (process.env.SUBSTACK_URL || "https://wortins.substack.com").replace(/\/$/, "");
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const FORCE = process.env.FORCE === "1" || process.env.FORCE === "true";

// Mirrors the newsletter's phone-first tiers: one hero story, then scannable
// one-liners. Tools are deliberately left out.
const TIERS = { also: 4, money: 3, reads: 3 };
const DAILY_IN_NOTE = 5;

const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

async function sb(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Supabase ${init.method || "GET"} ${path} → ${res.status} ${body}`);
  }
  return body ? JSON.parse(body) : null;
}

// ---- text helpers -----------------------------------------------------------
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

// House style: no em/en dashes. Numeric ranges keep a hyphen.
function deDash(s) {
  return String(s ?? "")
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")
    .replace(/\s*[–—]\s*/g, ", ")
    .replace(/\s*,\s*,/g, ",")
    .replace(/^\s*,\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Keep whole sentences (never a mid-word cut): the first sentence, plus more
// while under budget, so each story reads as a 2-3 line blurb.
function clean(s, budget = 320) {
  if (!s) return "";
  const t = deDash(s);
  const sentences = t.match(/[^.!?]+[.!?]+(?:\s|$)/g);
  if (!sentences) return /[.!?…]$/.test(t) ? t : t + ".";
  let out = sentences[0].trim();
  for (let i = 1; i < sentences.length; i++) {
    const next = `${out} ${sentences[i].trim()}`;
    if (next.length > budget) break;
    out = next;
  }
  return out;
}

function prettyDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[dt.getUTCDay()]}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

function buildTiers(items) {
  const g = { daily: [], tools: [], articles: [], funding: [] };
  for (const it of items) if (g[it.section]) g[it.section].push(it);
  for (const k of Object.keys(g)) g[k].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  return {
    hero: g.daily[0] || null,
    also: g.daily.slice(1, 1 + TIERS.also),
    money: g.funding.slice(0, TIERS.money),
    reads: g.articles.slice(0, TIERS.reads),
  };
}

// Plain-English rewrite when the simplify pass produced one, else the curator's
// text, so a missing rewrite degrades instead of breaking.
function headlineOf(it) { return it.plain_title ? deDash(it.plain_title) : deDash(it.title); }
function lineOf(it) { return it.plain_line ? clean(it.plain_line) : clean(it.summary); }
// A funding one-liner must name the company itself; curator summaries often
// don't ("275 million dollar Series C..."), so fall back to the title.
function moneyLineOf(it) { return it.plain_line ? clean(it.plain_line) : deDash(it.title); }

// ---- the pasteable post -----------------------------------------------------
// Deliberately plain, semantic HTML (no inline styles): Substack's editor maps
// h3/strong/a/p onto its own blocks cleanly, and styles would just be stripped.
function buildPost({ edition, tiers, dateISO }) {
  const title = deDash(edition?.headline || `The Wortins Daily · ${prettyDate(dateISO)}`);
  const dek = clean(edition?.synopsis, 240);

  const parts = [];
  const lines = [];
  if (dek) { parts.push(`<p><em>${esc(dek)}</em></p>`); lines.push(dek, ""); }

  const url = (it) => `${SITE_URL}/story/${encodeURIComponent(it.slug)}`;
  const heading = (t) => { parts.push(`<h3>${esc(t)}</h3>`); lines.push(t.toUpperCase(), ""); };
  const item = (it) => {
    const h = headlineOf(it), l = lineOf(it);
    parts.push(`<p><strong><a href="${url(it)}">${esc(h)}</a></strong></p>`);
    if (l) parts.push(`<p>${esc(l)}</p>`);
    lines.push(h, ...(l ? [l] : []), url(it), "");
  };

  if (tiers.hero) {
    heading("Today's big story");
    item(tiers.hero);
  }
  if (tiers.also.length) { heading("Also today"); tiers.also.forEach(item); }
  if (tiers.money.length) {
    heading("The money");
    for (const it of tiers.money) {
      const l = moneyLineOf(it);
      parts.push(`<p><a href="${url(it)}">${esc(l)}</a></p>`);
      lines.push(l, url(it), "");
    }
  }
  if (tiers.reads.length) { heading("Worth reading"); tiers.reads.forEach(item); }

  parts.push(
    `<p>The full briefing, with our take on every story, is at <a href="${SITE_URL}">wortins.com</a>. A fresh AI edition every morning.</p>`
  );
  lines.push(`The full briefing, with our take on every story, is at ${SITE_URL}`);

  const noteHeads = [tiers.hero, ...tiers.also].filter(Boolean).slice(0, DAILY_IN_NOTE);
  const noteText = [
    `🗞️ ${title}`,
    "",
    "The AI stories that matter today:",
    ...noteHeads.map((it) => `• ${headlineOf(it)}`),
    "",
    "Full briefing + our take on each:",
    `${SITE_URL}/edition/${dateISO}`,
  ].join("\n");

  return { title, dek, postHtml: parts.join("\n"), postText: lines.join("\n"), noteText };
}

// ---- the hand-off email -----------------------------------------------------
function buildEmail({ post, dateISO, storyCount }) {
  const composer = `${SITE_URL}/compose?date=${dateISO}`;
  // buildPost keeps the markup style-free so it pastes cleanly into Substack.
  // For the *email* preview, brand the links so it doesn't read as raw HTML.
  const styledPost = post.postHtml.replace(
    /<a href=/g,
    '<a style="color:#9c2b1d;text-decoration:none" href='
  );
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f3ecda;color:#1b1712;font-family:Georgia,'Times New Roman',serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3ecda"><tr><td align="center" style="padding:26px 16px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="border-bottom:3px solid #1b1712;padding-bottom:12px">
    <span style="font-size:22px;letter-spacing:.09em;font-weight:700">WORTINS → SUBSTACK</span>
    <div style="font-family:monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#6a6052;margin-top:8px">Ready to publish · ${prettyDate(dateISO)} · ${storyCount} stories</div>
  </td></tr>

  <tr><td style="padding:22px 0 0">
    <a href="${composer}" style="display:inline-block;background:#9c2b1d;color:#f3ecda;text-decoration:none;font-size:16px;font-weight:700;padding:13px 22px;border-radius:8px">Open the composer → one-click copy</a>
    <a href="${SUBSTACK_URL}/publish/post?type=newsletter" style="display:inline-block;margin-left:10px;border:1px solid #9c2b1d;color:#9c2b1d;text-decoration:none;font-size:15px;padding:12px 18px;border-radius:8px">New Substack post ↗</a>
    <div style="font-size:13px;color:#6a6052;margin-top:9px">Copy title → copy post → paste into Substack → Publish. About 30 seconds.</div>
  </td></tr>

  <tr><td style="padding:26px 0 0">
    <div style="font-family:monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9c2b1d;border-bottom:1px solid #d8ccb2;padding-bottom:7px">Post title</div>
    <div style="font-size:24px;line-height:1.2;font-weight:700;padding:12px 0 0">${esc(post.title)}</div>
  </td></tr>

  <tr><td style="padding:26px 0 0">
    <div style="font-family:monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9c2b1d;border-bottom:1px solid #d8ccb2;padding-bottom:7px">The post</div>
    <div style="padding:14px 0 0;font-size:15px;line-height:1.55">${styledPost}</div>
  </td></tr>

  <tr><td style="padding:28px 0 0;border-top:1px solid #c9bda4">
    <div style="font-family:monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9c2b1d;padding:14px 0 7px">Short Note (optional)</div>
    <pre style="white-space:pre-wrap;word-wrap:break-word;font-family:monospace;font-size:12.5px;line-height:1.55;margin:0;color:#3a342a">${esc(post.noteText)}</pre>
  </td></tr>

  <tr><td style="padding:22px 0 0">
    <p style="margin:0;font-family:monospace;font-size:11px;line-height:1.6;color:#938a76">Sent automatically after the Wortins Daily for ${dateISO}. Composer: <a href="${composer}" style="color:#938a76">${composer}</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

async function sendEmail({ subject, html, text }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: MAIL_FROM, to: [MAIL_TO], subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status} ${body}`);
  }
}

// ---- main -------------------------------------------------------------------
async function main() {
  if (!SUPABASE_KEY) die("SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY for a dry run) is required");
  if (!RESEND_API_KEY && !DRY_RUN) die("RESEND_API_KEY is required (or set DRY_RUN=1)");

  let dateISO = process.env.EDITION_DATE || "";
  if (!dateISO) {
    const rows = await sb(
      "items?is_active=eq.true&edition_date=not.is.null&select=edition_date&order=edition_date.desc&limit=1"
    );
    dateISO = rows?.[0]?.edition_date;
  }
  if (!dateISO) die("No edition with items found");
  console.log(`→ Edition ${dateISO}`);

  if (!FORCE && !DRY_RUN) {
    const already = await sb(
      `substack_drafts?edition_date=eq.${dateISO}&select=edition_date,sent_at`
    ).catch(() => null);
    if (already?.length) {
      console.log(`✓ Already handed off ${dateISO} at ${already[0].sent_at}. Skipping (FORCE=1 to resend).`);
      return;
    }
  }

  const items = await sb(
    `items?is_active=eq.true&edition_date=eq.${dateISO}&select=section,slug,title,summary,source,rank,plain_title,plain_line`
  );
  if (!items?.length) die(`No active items for ${dateISO}`);
  const tiers = buildTiers(items);
  const editionRows = await sb(`editions?edition_date=eq.${dateISO}&select=headline,synopsis`);
  const edition = editionRows?.[0] || null;

  const post = buildPost({ edition, tiers, dateISO });
  const storyCount = [tiers.hero, ...tiers.also, ...tiers.money, ...tiers.reads].filter(Boolean).length;
  const html = buildEmail({ post, dateISO, storyCount });
  const subject = `Substack ready: ${post.title}`;

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] subject: ${subject}`);
    console.log(`[DRY RUN] ${storyCount} stories, email ${html.length} bytes, would go to ${MAIL_TO}`);
    console.log(`\n--- post text ---\n${post.postText}\n`);
    if (process.env.WRITE_PREVIEW) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(process.env.WRITE_PREVIEW, html);
      console.log(`[DRY RUN] wrote ${process.env.WRITE_PREVIEW}`);
    }
    return;
  }

  await sendEmail({ subject, html, text: post.postText });
  console.log(`✓ Sent the Substack hand-off to ${MAIL_TO}`);

  await sb("substack_drafts", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ edition_date: dateISO, title: post.title, sent_at: new Date().toISOString() }),
  });
  console.log(`✓ Recorded hand-off for ${dateISO}.`);
}

export { buildPost, buildEmail, buildTiers, deDash, clean };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => die(e.message));
}
