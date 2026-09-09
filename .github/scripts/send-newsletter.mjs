#!/usr/bin/env node
// Sends the Wortins Daily email for the latest edition.
//
// Pipeline: read the latest edition's items + synopsis from Supabase (service
// role), render one newspaper-style email per active subscriber (each with its
// own unsubscribe link), send via Resend, then record the send so a re-run can't
// double-mail. Self-contained — uses global fetch + the Supabase/Resend REST
// APIs, no npm deps, so CI just runs `node`.
//
// The newsletter is deliberately NON-personalized: every subscriber gets the
// same editorial top-of-each-section (by curator rank) — broadly interesting
// news, not persona-targeted. That's the point of the email vs. the app feed.
//
// Env:
//   SUPABASE_URL           (default: the project URL below)
//   SUPABASE_SERVICE_KEY   (required) service-role key — the list is private
//   RESEND_API_KEY         (required unless DRY_RUN) Resend API key
//   SITE_URL               (default https://www.wortins.com)
//   MAIL_FROM              (default 'Wortins Daily <daily@wortins.com>')
//   MAIL_REPLY_TO          (default hello@wortins.com)
//   EDITION_DATE           (optional YYYY-MM-DD; default = latest edition w/ items)
//   DRY_RUN=1              render + count recipients, send nothing
//   FORCE=1                send even if this edition was already sent

import { fileURLToPath } from "node:url";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://zrjbzowohsgjbrhsldfi.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SITE_URL = (process.env.SITE_URL || "https://www.wortins.com").replace(/\/$/, "");
const MAIL_FROM = process.env.MAIL_FROM || "Wortins Daily <daily@wortins.com>";
const MAIL_REPLY_TO = process.env.MAIL_REPLY_TO || "hello@wortins.com";
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const FORCE = process.env.FORCE === "1" || process.env.FORCE === "true";

// Phone-first tiers. A reader on a phone can absorb ONE story properly, then
// scan the rest, so the day gets a single hero plus one-line items. Top stories
// lead (hero + "Also today"), funding is condensed into "The money" one-liners
// because funding news is naturally list-shaped, and essays close it out.
const TIERS = { also: 4, money: 3, reads: 3 };

const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// ---- Supabase REST helpers --------------------------------------------------
async function sb(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Supabase ${init.method || "GET"} ${path} → ${res.status} ${body}`);
  }
  // Writes (e.g. the newsletter_sends upsert) can return 201 with an empty body;
  // only JSON.parse when there's actually something to parse.
  return body ? JSON.parse(body) : null;
}

// ---- text helpers -----------------------------------------------------------
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

// Strip em/en dashes (house style: no dashes). Em dash -> comma; a numeric
// en-dash range (2020–21) -> hyphen; any other en dash -> comma.
function deDash(s) {
  return String(s ?? "")
    .replace(/\s*—\s*/g, ", ")
    .replace(/(\d)\s*–\s*(\d)/g, "$1-$2")
    .replace(/\s*–\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

// Give a summary a clean ending so it never reads as cut off mid-thought.
function tidy(s) {
  if (!s) return "";
  s = deDash(s);
  return /[.!?…]$/.test(s) ? s : s + ".";
}

// Keep the intro to ~3 lines: cut on a word boundary and add an ellipsis.
function trimSynopsis(s, max = 155) {
  if (!s) return "";
  s = deDash(s);
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return cut.slice(0, at > 80 ? at : max).replace(/[,;:.\s]+$/, "") + "…";
}

function prettyDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[dt.getUTCDay()]}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

// Filler words trimmed off the end of a shortened headline so a subject
// fragment never dangles on "for"/"to"/"of".
const SUBJECT_FILLER = new Set(["for","of","the","to","a","an","and","with","at","in","on","by","from","as","its","&"]);

// Compress a curator headline into a short subject-line fragment. Only needed
// as a fallback: a plain_title is already short and human.
function shortHeadline(title, max = 34) {
  let t = deDash(title);
  const colon = t.indexOf(":");
  if (colon >= 10 && colon <= 40) t = t.slice(0, colon);
  if (t.length > max) {
    const cut = t.slice(0, max);
    const at = cut.lastIndexOf(" ");
    t = cut.slice(0, at > 12 ? at : max);
  }
  t = t.replace(/[\s,;:.]+$/, "");
  const words = t.split(" ");
  if (words.length > 2 && SUBJECT_FILLER.has(words[words.length - 1].toLowerCase())) words.pop();
  return words.join(" ").trim();
}

// The plain-English headline when the simplify pass produced one, else the
// curator's. Everything downstream reads stories through these two accessors,
// so a missing rewrite degrades to the old text instead of breaking.
function headlineOf(it) {
  return it.plain_title ? deDash(it.plain_title) : deDash(it.title);
}
function lineOf(it) {
  return it.plain_line ? tidy(it.plain_line) : tidy(it.summary);
}
// A funding one-liner has to name the company and the number on its own. The
// curator summary often omits the company ("275 million dollar Series C..."),
// so fall back to the title rather than the summary.
function moneyLineOf(it) {
  return it.plain_line ? tidy(it.plain_line) : deDash(it.title);
}

// Subject = a few specific top headlines joined by " | " plus the day's story
// count. Plain titles make far better inbox fragments than curator titles.
function buildSubject({ tiers, totalCount, dateISO }) {
  const top = [tiers.hero, ...tiers.also].filter(Boolean).slice(0, 3);
  const all = top
    .map((it) => (it.plain_title ? deDash(it.plain_title) : shortHeadline(it.title)))
    .filter(Boolean);
  // Budget the line: plain titles are full sentences, so three of them overflow
  // every inbox. Take headlines while they fit, always keeping at least one.
  const heads = [];
  for (const h of all) {
    const next = heads.length ? `${heads.join(" | ")} | ${h}` : h;
    if (heads.length && next.length > 110) break;
    heads.push(h);
  }
  if (!heads.length) return `The Wortins Daily · ${prettyDate(dateISO)}`;
  const tail = totalCount > heads.length ? ` | ${totalCount} AI stories today` : "";
  return heads.join(" | ") + tail;
}

// Split the edition into the phone-first tiers. Top stories lead: the
// highest-ranked daily story becomes the hero, the next few become one-liners.
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

// ---- HTML rendering ---------------------------------------------------------
const INK = "#1b1712", BODY = "#4a4338", MUT = "#8a7f6a", RED = "#9c2b1d",
      BG = "#f3ecda", RULE = "#ded3ba";

function storyUrl(it) {
  return `${SITE_URL}/story/${encodeURIComponent(it.slug)}`;
}

function sectionLabel(text) {
  return `<div style="font-family:monospace;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:${RED};padding:0 0 10px">${esc(text)}</div>`;
}

// A scannable item: plain headline you can understand at a glance, then one
// supporting line. Sizes are deliberately large for thumb-distance reading.
function renderItem(it) {
  const line = lineOf(it);
  return `<div style="padding:0 0 24px">
    <a href="${storyUrl(it)}" style="display:block;font-size:19px;line-height:1.35;font-weight:700;color:${INK};text-decoration:none">${esc(headlineOf(it))}</a>
    ${line ? `<div style="font-size:16px;line-height:1.6;color:${BODY};padding:6px 0 0">${esc(line)}</div>` : ""}
  </div>`;
}

function renderMoney(it) {
  return `<div style="padding:0 0 18px">
    <a href="${storyUrl(it)}" style="font-size:16px;line-height:1.6;color:${BODY};text-decoration:none">${esc(moneyLineOf(it))}</a>
  </div>`;
}

function renderBlock(label, inner) {
  if (!inner) return "";
  return `<tr><td style="padding:10px 0 0;border-top:1px solid ${RULE}">
    <div style="padding:22px 0 0">${sectionLabel(label)}${inner}</div>
  </td></tr>`;
}

function renderEmail({ tiers, unsubUrl, dateISO }) {
  const hero = tiers.hero;
  const heroLine = hero ? lineOf(hero) : "";
  const heroBlock = hero
    ? `<tr><td style="padding:22px 0 0;border-top:2px solid ${INK}">
        ${sectionLabel("Today's big story")}
        <a href="${storyUrl(hero)}" style="display:block;font-size:26px;line-height:1.25;font-weight:700;color:${INK};text-decoration:none">${esc(headlineOf(hero))}</a>
        ${heroLine ? `<div style="font-size:17px;line-height:1.6;color:${BODY};padding:10px 0 0">${esc(heroLine)}</div>` : ""}
        <div style="padding:12px 0 0"><a href="${storyUrl(hero)}" style="font-size:15px;color:${RED};text-decoration:none">Read the full story &rarr;</a></div>
      </td></tr>`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:${BG};color:${INK};font-family:Georgia,'Times New Roman',serif;-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG}"><tr><td align="center" style="padding:24px 20px 40px">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%">
  <tr><td style="padding:0 0 6px">
    <span style="font-size:21px;letter-spacing:.11em;font-weight:700">WORTINS</span>
    <div style="font-family:monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:${MUT};padding:8px 0 0">${prettyDate(dateISO)}</div>
  </td></tr>
  ${heroBlock}
  ${renderBlock("Also today", tiers.also.map(renderItem).join(""))}
  ${renderBlock("The money", tiers.money.map(renderMoney).join(""))}
  ${renderBlock("Worth reading", tiers.reads.map(renderItem).join(""))}
  <tr><td style="padding:14px 0 0;border-top:1px solid ${RULE}">
    <div style="font-size:15px;line-height:1.6;color:${BODY};padding:18px 0 0">Everything else from today is at <a href="${SITE_URL}" style="color:${RED};text-decoration:none">wortins.com</a>.</div>
    <div style="font-family:monospace;font-size:11px;line-height:1.6;color:${MUT};padding:12px 0 0">You're getting this because you subscribed at wortins.com. <a href="${unsubUrl}" style="color:${MUT}">Unsubscribe</a>.</div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const lines = [`WORTINS · ${prettyDate(dateISO)}`];
  if (hero) {
    lines.push(`\nTODAY'S BIG STORY\n`, headlineOf(hero));
    if (heroLine) lines.push(heroLine);
    lines.push(storyUrl(hero));
  }
  const textBlock = (label, arr, fn) => {
    if (!arr.length) return;
    lines.push(`\n${label}\n`);
    for (const it of arr) {
      lines.push(fn(it));
      lines.push(`  ${storyUrl(it)}`);
    }
  };
  textBlock("ALSO TODAY", tiers.also, (it) => `• ${headlineOf(it)}\n  ${lineOf(it)}`);
  textBlock("THE MONEY", tiers.money, (it) => `• ${moneyLineOf(it)}`);
  textBlock("WORTH READING", tiers.reads, (it) => `• ${headlineOf(it)}\n  ${lineOf(it)}`);
  lines.push(`\n---\nEverything else from today is at ${SITE_URL}`);
  lines.push(`Unsubscribe: ${unsubUrl}`);
  return { html, text: lines.join("\n") };
}

// ---- Resend send ------------------------------------------------------------
async function sendOne({ email, token, subject, dateISO, tiers }) {
  const unsubUrl = `${SITE_URL}/api/unsubscribe?token=${token}`;
  const { html, text } = renderEmail({ tiers, unsubUrl, dateISO });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [email],
      reply_to: MAIL_REPLY_TO,
      subject,
      html,
      text,
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${body}`);
  }
}

// Small concurrency pool so we don't hammer Resend's rate limit.
async function sendAll(subscribers, ctx) {
  const CHUNK = 5;
  let ok = 0;
  const failures = [];
  for (let i = 0; i < subscribers.length; i += CHUNK) {
    const batch = subscribers.slice(i, i + CHUNK);
    const results = await Promise.allSettled(
      batch.map((s) =>
        sendOne({ email: s.email, token: s.unsubscribe_token, ...ctx })
      )
    );
    results.forEach((r, j) => {
      if (r.status === "fulfilled") ok++;
      else failures.push({ email: batch[j].email, error: r.reason?.message });
    });
    if (i + CHUNK < subscribers.length) await new Promise((r) => setTimeout(r, 600));
  }
  return { ok, failures };
}

// ---- main -------------------------------------------------------------------
async function main() {
  if (!SERVICE_KEY) die("SUPABASE_SERVICE_KEY is required");
  if (!RESEND_API_KEY && !DRY_RUN) die("RESEND_API_KEY is required (or set DRY_RUN=1)");

  // 1. Which edition?
  let dateISO = process.env.EDITION_DATE || "";
  if (!dateISO) {
    const rows = await sb(
      "items?is_active=eq.true&edition_date=not.is.null&select=edition_date&order=edition_date.desc&limit=1"
    );
    dateISO = rows?.[0]?.edition_date;
  }
  if (!dateISO) die("No edition with items found");
  console.log(`→ Edition ${dateISO}`);

  // 2. Idempotency guard.
  if (!FORCE) {
    const already = await sb(
      `newsletter_sends?edition_date=eq.${dateISO}&select=edition_date,recipients,sent_at`
    );
    if (already?.length) {
      console.log(
        `✓ Already sent ${dateISO} to ${already[0].recipients} at ${already[0].sent_at}. Skipping (use FORCE=1 to resend).`
      );
      return;
    }
  }

  // 3. Content.
  const items = await sb(
    `items?is_active=eq.true&edition_date=eq.${dateISO}&select=section,slug,title,summary,source,rank,plain_title,plain_line`
  );
  if (!items?.length) die(`No active items for ${dateISO}`);
  const tiers = buildTiers(items);
  const editionRows = await sb(
    `editions?edition_date=eq.${dateISO}&select=headline,synopsis`
  );
  const edition = editionRows?.[0] || null;
  // Subject = a few specific top headlines joined by " | " plus the day's story
  // count (see buildSubject), so the inbox shows real news rather than a
  // boilerplate masthead. `items` is every active story for the edition.
  const subject = buildSubject({ tiers, totalCount: items.length, dateISO });

  // 4. Recipients.
  const subscribers = await sb(
    "subscribers?status=eq.active&select=email,unsubscribe_token"
  );
  console.log(
    `→ ${items.length} stories · ${subscribers?.length || 0} active subscribers · subject: "${subject}"`
  );

  if (DRY_RUN) {
    const { html } = renderEmail({
      tiers,
      unsubUrl: `${SITE_URL}/api/unsubscribe?token=PREVIEW`,
      dateISO,
    });
    console.log(`\n[DRY RUN] would send to ${subscribers?.length || 0} recipients.`);
    console.log(`[DRY RUN] email is ${html.length} bytes. Nothing sent.`);
    return;
  }

  if (!subscribers?.length) {
    console.log("✓ No active subscribers — nothing to send.");
    return;
  }

  // 5. Send.
  const { ok, failures } = await sendAll(subscribers, {
    subject,
    dateISO,
    tiers,
  });
  console.log(`→ Sent ${ok}/${subscribers.length}. Failures: ${failures.length}`);
  if (failures.length) console.log(JSON.stringify(failures.slice(0, 10), null, 2));

  // 6. Record the send (only if at least one went out) so we don't double-mail.
  if (ok > 0) {
    await sb("newsletter_sends", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        edition_date: dateISO,
        recipients: ok,
        sent_at: new Date().toISOString(),
      }),
    });
    console.log(`✓ Recorded send for ${dateISO}.`);
  }

  if (ok === 0) die("All sends failed");
}

// Export the renderer for local preview; only run the sender when executed
// directly (`node send-newsletter.mjs`), not when imported.
export { renderEmail, buildTiers, trimSynopsis, tidy, deDash, shortHeadline, buildSubject,
         headlineOf, lineOf, moneyLineOf };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => die(e.message));
}
