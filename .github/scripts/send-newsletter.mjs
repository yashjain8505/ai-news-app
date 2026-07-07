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

// Keep the email short + skimmable: only the top of each section (by curator
// rank) — the stories anyone would find worth reading.
const SECTION_LIMITS = { daily: 5, tools: 3, articles: 3, funding: 3 };
const SECTION_TITLES = {
  daily: "Daily AI Updates",
  tools: "New Tools",
  articles: "Interesting Articles",
  funding: "Funding",
};
const SECTION_SHORT = { daily: "Daily AI", tools: "New Tools", articles: "Articles", funding: "Funding" };
const SECTION_PATHS = { daily: "/", tools: "/new-tools", articles: "/articles", funding: "/funding" };
const SECTION_ORDER = ["daily", "tools", "articles", "funding"];

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

// Give a summary a clean ending so it never reads as cut off mid-thought.
function tidy(s) {
  if (!s) return "";
  s = s.trim().replace(/\s+/g, " ");
  return /[.!?…]$/.test(s) ? s : s + ".";
}

// Keep the intro to ~2-4 lines: cut on a word boundary and add an ellipsis.
function trimSynopsis(s, max = 200) {
  if (!s) return "";
  s = s.trim().replace(/\s+/g, " ");
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return cut.slice(0, at > 60 ? at : max).replace(/[,;:.\s]+$/, "") + "…";
}

function prettyDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[dt.getUTCDay()]}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

function groupBySection(items) {
  const g = { daily: [], tools: [], articles: [], funding: [] };
  for (const it of items) if (g[it.section]) g[it.section].push(it);
  for (const k of Object.keys(g)) {
    g[k].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    g[k] = g[k].slice(0, SECTION_LIMITS[k]);
  }
  return g;
}

// ---- HTML rendering ---------------------------------------------------------
function renderStory(it) {
  const href = `${SITE_URL}/story/${encodeURIComponent(it.slug)}`;
  const src = it.source
    ? `<div style="color:#6a6052;text-transform:uppercase;letter-spacing:0.08em;font-size:11px;font-family:monospace">${esc(it.source)}</div>`
    : "";
  const summary = it.summary
    ? `<p style="margin:5px 0 0;font-size:14px;line-height:1.5;color:#4a4338">${esc(tidy(it.summary))}</p>`
    : "";
  return `<tr><td style="padding:14px 0;border-bottom:1px solid #d8ccb2">
    ${src}
    <a href="${href}" style="display:block;margin:4px 0 0;font-size:15px;line-height:1.3;font-weight:700;color:#1b1712;text-decoration:none">${esc(it.title)}</a>
    ${summary}
  </td></tr>`;
}

function renderSection(key, stories) {
  if (!stories.length) return "";
  const rows = stories.map(renderStory).join("");
  const moreHref = `${SITE_URL}${SECTION_PATHS[key]}`;
  return `<tr><td style="padding:24px 0 0">
    <div style="font-family:monospace;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#9c2b1d;border-bottom:2px solid #1b1712;padding-bottom:6px">${SECTION_TITLES[key]}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>
    <div style="padding:11px 0 0">
      <a href="${moreHref}" style="font-size:13px;font-style:italic;color:#9c2b1d;text-decoration:none">Explore all ${SECTION_SHORT[key]} &rarr;</a>
    </div>
  </td></tr>`;
}

function renderEmail({ edition, grouped, unsubUrl, dateISO }) {
  const sections = SECTION_ORDER.map((k) => renderSection(k, grouped[k])).join("");
  const synopsis = edition?.synopsis
    ? `<tr><td style="padding:16px 0 2px"><p style="margin:0;font-size:15px;line-height:1.55;color:#3a342a">${esc(trimSynopsis(edition.synopsis))}</p></td></tr>`
    : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @media (max-width:480px){
    .wrap{padding:16px 14px !important}
    .mast{font-size:22px !important}
  }
</style></head>
<body style="margin:0;background:#f3ecda;color:#1b1712;font-family:Georgia,'Times New Roman',serif;-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3ecda"><tr><td align="center" class="wrap" style="padding:24px 16px">
<table role="presentation" width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%">
  <tr><td style="border-bottom:3px solid #1b1712;padding-bottom:12px">
    <span style="display:inline-block;width:30px;height:30px;background:#9c2b1d;color:#f3ecda;font-size:21px;font-weight:700;text-align:center;line-height:30px;vertical-align:middle">W</span>
    <span class="mast" style="font-size:24px;letter-spacing:0.1em;font-weight:700;vertical-align:middle;margin-left:9px">WORTINS</span>
    <div style="font-family:monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#6a6052;margin-top:9px">The Daily AI Briefing &middot; ${prettyDate(dateISO)}</div>
  </td></tr>
  ${synopsis}
  ${sections}
  <tr><td style="padding:28px 0 0;border-top:1px solid #c9bda4">
    <p style="margin:14px 0 0;font-size:14px;color:#4a4338">The full editions live at <a href="${SITE_URL}" style="color:#9c2b1d;text-decoration:none">wortins.com</a>.</p>
    <p style="margin:9px 0 0;font-family:monospace;font-size:11px;line-height:1.5;color:#938a76">
      You're getting this because you subscribed at wortins.com.
      <a href="${unsubUrl}" style="color:#938a76">Unsubscribe</a>.
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const lines = [];
  lines.push(`WORTINS — The Daily AI Briefing`);
  lines.push(prettyDate(dateISO));
  if (edition?.synopsis) lines.push(`\n${trimSynopsis(edition.synopsis)}`);
  for (const k of SECTION_ORDER) {
    if (!grouped[k].length) continue;
    lines.push(`\n${SECTION_TITLES[k].toUpperCase()}`);
    for (const it of grouped[k]) {
      lines.push(`\n• ${it.title}${it.source ? ` (${it.source})` : ""}`);
      if (it.summary) lines.push(`  ${tidy(it.summary)}`);
      lines.push(`  ${SITE_URL}/story/${it.slug}`);
    }
    lines.push(`  Explore all ${SECTION_SHORT[k]}: ${SITE_URL}${SECTION_PATHS[k]}`);
  }
  lines.push(`\n—\nThe full editions live at ${SITE_URL}`);
  lines.push(`Unsubscribe: ${unsubUrl}`);
  return { html, text: lines.join("\n") };
}

// ---- Resend send ------------------------------------------------------------
async function sendOne({ email, token, subject, dateISO, edition, grouped }) {
  const unsubUrl = `${SITE_URL}/api/unsubscribe?token=${token}`;
  const { html, text } = renderEmail({ edition, grouped, unsubUrl, dateISO });
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
    `items?is_active=eq.true&edition_date=eq.${dateISO}&select=section,slug,title,summary,source,rank`
  );
  if (!items?.length) die(`No active items for ${dateISO}`);
  const grouped = groupBySection(items);
  const editionRows = await sb(
    `editions?edition_date=eq.${dateISO}&select=headline,synopsis`
  );
  const edition = editionRows?.[0] || null;
  // Subject = the day's headline itself (the "from" name already says Wortins
  // Daily), so it reads as a compelling line in the inbox rather than boilerplate.
  const subject = edition?.headline || `The Wortins Daily · ${prettyDate(dateISO)}`;

  // 4. Recipients.
  const subscribers = await sb(
    "subscribers?status=eq.active&select=email,unsubscribe_token"
  );
  console.log(
    `→ ${items.length} stories · ${subscribers?.length || 0} active subscribers · subject: "${subject}"`
  );

  if (DRY_RUN) {
    const { html } = renderEmail({
      edition,
      grouped,
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
    edition,
    grouped,
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
export { renderEmail, groupBySection, trimSynopsis, tidy };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => die(e.message));
}
