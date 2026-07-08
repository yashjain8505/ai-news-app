#!/usr/bin/env node
// Posts the daily Wortins edition as a Substack Note.
//
// Pipeline: read the latest edition's headline + top stories from Supabase
// (same content the email uses), build a short-form Note (a ProseMirror "doc"),
// attach a link-preview card pointing at the edition on wortins.com, publish it
// via Substack's internal Notes API, then record the post so a re-run can't
// double-post. Self-contained — uses global fetch only, no npm deps, so CI just
// runs `node` (mirrors send-newsletter.mjs).
//
// Substack has no official write API. This uses the same internal endpoints the
// web app uses, authenticated with a logged-in session cookie:
//   1. POST https://substack.com/api/v1/comment/attachment  -> { id }   (link card)
//   2. POST https://substack.com/api/v1/comment/feed        -> publishes the note
//
// Env:
//   SUPABASE_URL           (default: the project URL below)
//   SUPABASE_SERVICE_KEY   service-role key (CI). For a local DRY_RUN read you
//                          can instead pass SUPABASE_ANON_KEY (active items are
//                          public), but the ledger write needs the service key.
//   SUBSTACK_COOKIE        (required unless DRY_RUN) full Cookie header from a
//                          logged-in substack.com session (must include the
//                          connect.sid / substack.sid session cookies).
//   SITE_URL               (default https://www.wortins.com)
//   EDITION_DATE           (optional YYYY-MM-DD; default = latest edition w/ items)
//   DAILY_COUNT            (default 5) how many top "daily" stories to list
//   DRY_RUN=1              build + print the note and payload, post nothing
//   FORCE=1                post even if this edition was already posted

import { fileURLToPath } from "node:url";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://zrjbzowohsgjbrhsldfi.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const SUBSTACK_COOKIE = process.env.SUBSTACK_COOKIE;
const SITE_URL = (process.env.SITE_URL || "https://www.wortins.com").replace(/\/$/, "");
const DAILY_COUNT = Math.max(1, Number(process.env.DAILY_COUNT) || 5);
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const FORCE = process.env.FORCE === "1" || process.env.FORCE === "true";

const SUBSTACK = "https://substack.com";
const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function prettyDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[dt.getUTCDay()]}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

// ---- Supabase REST ----------------------------------------------------------
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

// ---- Substack Notes API -----------------------------------------------------
async function substack(path, payload) {
  const res = await fetch(`${SUBSTACK}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: SUBSTACK,
      Referer: `${SUBSTACK}/`,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      Cookie: SUBSTACK_COOKIE,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Substack POST ${path} → ${res.status} ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

// Create a link-preview card; returns its attachment id.
async function createLinkAttachment(url) {
  const json = await substack("/api/v1/comment/attachment", { url, type: "link" });
  const id = Array.isArray(json) ? json[0]?.id : json?.id;
  if (!id) throw new Error(`No attachment id in response: ${JSON.stringify(json).slice(0, 300)}`);
  return id;
}

async function publishNote(bodyJson, attachmentIds) {
  return substack("/api/v1/comment/feed", {
    bodyJson,
    tabId: "for-you",
    surface: "feed",
    replyMinimumRole: "everyone",
    attachmentIds,
  });
}

// ---- Note body (ProseMirror doc) --------------------------------------------
function textNode(text, marks) {
  const node = { type: "text", text };
  if (marks && marks.length) node.marks = marks;
  return node;
}
function para(content) {
  return { type: "paragraph", content };
}

function buildNote({ edition, daily, dateISO, editionUrl }) {
  const content = [];

  // 1. Hook: the edition headline, bold. Falls back to a masthead line.
  const hook = edition?.headline
    ? `🗞️ ${edition.headline}`
    : `🗞️ The Wortins Daily · ${prettyDate(dateISO)}`;
  content.push(para([textNode(hook, [{ type: "strong" }])]));

  // 2. Framing line.
  content.push(para([textNode("The AI stories that matter today 👇")]));

  // 3. Top daily headlines as bullet lines.
  for (const it of daily) {
    const label = it.source ? `${it.title} (${it.source})` : it.title;
    content.push(para([textNode(`• ${label}`)]));
  }

  // 4. CTA with an inline link (the link-card attachment is the primary CTA).
  content.push(
    para([
      textNode("Full briefing + our take on each → "),
      textNode("wortins.com", [{ type: "link", attrs: { href: editionUrl } }]),
    ])
  );

  return { type: "doc", attrs: { schemaVersion: "v1" }, content };
}

// Flatten a note doc to plain text for logging / storage.
function noteToText(doc) {
  return doc.content
    .map((p) => (p.content || []).map((t) => t.text).join(""))
    .join("\n");
}

// ---- main -------------------------------------------------------------------
async function main() {
  if (!SUPABASE_KEY) die("SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY for a dry run) is required");
  // Not configured yet -> skip cleanly (exit 0) rather than failing every day.
  // Add the SUBSTACK_COOKIE secret to switch posting on.
  if (!SUBSTACK_COOKIE && !DRY_RUN) {
    console.log("SUBSTACK_COOKIE not set, skipping. Add the secret to enable Substack posting.");
    return;
  }

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
      `substack_notes?edition_date=eq.${dateISO}&select=edition_date,posted_at,note_url`
    ).catch(() => null); // anon key (dry run) may not read the ledger — treat as not posted
    if (already?.length) {
      console.log(
        `✓ Already posted ${dateISO} at ${already[0].posted_at}${already[0].note_url ? ` (${already[0].note_url})` : ""}. Skipping (use FORCE=1 to repost).`
      );
      return;
    }
  }

  // 3. Content — top "daily" stories + the edition headline.
  const items = await sb(
    `items?is_active=eq.true&edition_date=eq.${dateISO}&section=eq.daily&select=title,source,rank,slug&order=rank.asc`
  );
  if (!items?.length) die(`No active daily items for ${dateISO}`);
  const daily = items.slice(0, DAILY_COUNT);
  const editionRows = await sb(`editions?edition_date=eq.${dateISO}&select=headline,synopsis`);
  const edition = editionRows?.[0] || null;

  const editionUrl = `${SITE_URL}/edition/${dateISO}`;
  const bodyJson = buildNote({ edition, daily, dateISO, editionUrl });

  console.log(`→ ${daily.length} stories · link → ${editionUrl}`);
  console.log("─".repeat(56));
  console.log(noteToText(bodyJson));
  console.log("─".repeat(56));

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Attachment payload:");
    console.log(JSON.stringify({ url: editionUrl, type: "link" }, null, 2));
    console.log("[DRY RUN] Note payload:");
    console.log(JSON.stringify({ bodyJson, tabId: "for-you", surface: "feed", replyMinimumRole: "everyone", attachmentIds: ["<attachment-id>"] }, null, 2));
    console.log("\n[DRY RUN] Nothing posted.");
    return;
  }

  // 4. Create the link card, then publish the note.
  const attachmentId = await createLinkAttachment(editionUrl);
  console.log(`→ Link attachment ${attachmentId}`);
  const posted = await publishNote(bodyJson, [attachmentId]);
  const noteId = posted?.id != null ? String(posted.id) : null;
  const handle = posted?.user?.handle || posted?.handle;
  const noteUrl = handle && noteId ? `${SUBSTACK}/@${handle}/note/c-${noteId}` : null;
  console.log(`✓ Posted note${noteId ? ` id=${noteId}` : ""}${noteUrl ? ` → ${noteUrl}` : ""}`);

  // 5. Record the post so we don't double-post this edition.
  await sb("substack_notes", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      edition_date: dateISO,
      posted_at: new Date().toISOString(),
      note_id: noteId,
      note_url: noteUrl,
    }),
  });
  console.log(`✓ Recorded post for ${dateISO}.`);
}

export { buildNote, noteToText };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => die(e.message));
}
