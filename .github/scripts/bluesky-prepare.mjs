#!/usr/bin/env node
// Prepares one Bluesky "review packet" for a morning / afternoon / evening slot.
//
// Flow (3x/day, human-in-the-loop):
//   1. Read the latest edition's top daily items from Supabase.
//   2. Find 5 real Bluesky posts worth replying to (lib/bluesky-search.mjs).
//   3. Draft, in one Claude call: a punchy first-person TAKE on the single most
//      interesting story (+ the top-5 alternates), and a reply to each of the 5
//      posts. (Uses the `claude` CLI + CLAUDE_CODE_OAUTH_TOKEN — no API key.)
//   4. Write a `bluesky_queue` row (the post) + 5 `bluesky_reply_queue` rows.
//   5. Email the user the drafts + a link to the /social review page, where they
//      edit and approve; the page's API routes do the actual posting.
//
// Nothing is ever auto-posted here — this only stages drafts for review.
// Idempotent per (run_date, slot). Self-contained: global fetch + the claude CLI.
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY   (service role)
//   RESEND_KEY                            Resend API key (email)
//   SITE_URL                 default https://www.wortins.com
//   BLUESKY_REVIEW_SECRET    gates the /social review link (same value in Vercel)
//   BLUESKY_IDENTIFIER       our handle (so search can exclude ourselves)
//   MAIL_FROM                default 'Wortins Social <daily@wortins.com>'
//   MAIL_TO                  default earanyash@gmail.com
//   SLOT                     morning|afternoon|evening (else derived from UTC hour)
//   DRY_RUN=1                draft + print, write nothing, email nothing
//   FORCE=1                  re-prepare even if this slot already exists

import { execFileSync } from "node:child_process";
import { findReplyTargets } from "./lib/bluesky-search.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://zrjbzowohsgjbrhsldfi.supabase.co";
// Service role for CI (writes); anon is enough for a local DRY_RUN (reads only).
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const DRAFT_MODEL = process.env.DRAFT_MODEL || ""; // blank = account default (what CI already uses)
const RESEND_KEY = process.env.RESEND_KEY;
const SITE_URL = (process.env.SITE_URL || "https://www.wortins.com").replace(/\/$/, "");
const REVIEW_SECRET = process.env.BLUESKY_REVIEW_SECRET || "";
const MAIL_FROM = process.env.MAIL_FROM || "Wortins Social <daily@wortins.com>";
const MAIL_TO = process.env.MAIL_TO || "earanyash@gmail.com";
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const FORCE = process.env.FORCE === "1" || process.env.FORCE === "true";

const die = (m) => { console.error(`✗ ${m}`); process.exit(1); };

function currentSlot() {
  if (process.env.SLOT) return process.env.SLOT;
  const h = new Date().getUTCHours();
  if (h < 7) return "morning";
  if (h < 12) return "afternoon";
  return "evening";
}

function deDash(s) {
  return String(s || "").replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2").replace(/\s*[–—]\s*/g, ", ").replace(/\s+/g, " ").trim();
}

// ---- Supabase REST ----------------------------------------------------------
async function sb(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const body = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`Supabase ${init.method || "GET"} ${path} -> ${res.status} ${body.slice(0, 200)}`);
  return body ? JSON.parse(body) : null;
}

// ---- Claude drafting (via the CLI; degrades gracefully if unavailable) -------
function claudeJSON(prompt) {
  try {
    const args = ["-p", prompt, "--output-format", "text"];
    if (DRAFT_MODEL) args.splice(2, 0, "--model", DRAFT_MODEL);
    const out = execFileSync("claude", args, {
      encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 180000, env: process.env,
    });
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no JSON in claude output");
    return JSON.parse(m[0]);
  } catch (e) {
    console.warn(`⚠ claude drafting unavailable (${e.message}); using template fallback.`);
    return null;
  }
}

function buildPrompt(items, targets) {
  const itemsList = items
    .map((it, i) => `${i + 1}. slug: ${it.slug}\nHEADLINE: ${it.title}\nEDITORIAL TAKE (where the real, specific point lives, mine on this story): ${deDash(it.wortins_take || it.summary || "")}`)
    .join("\n\n");
  const targetsList = targets
    .map((t, i) => `${i + 1}. @${t.authorHandle} posted: "${(t.text || "").replace(/\s+/g, " ").slice(0, 240)}"`)
    .join("\n");

  return `You ghost-write short Bluesky posts for the person behind Wortins, an independent AI-news brief. You are ONE real person reacting to the day's AI news, not a brand and not a thought-leader. You do not perform cleverness. You say what happened, then what you honestly think or how it landed for you.

Each story below has an EDITORIAL TAKE with the real details. Use it for the facts and the angle.

STRUCTURE, follow it closely:
1. Open by stating the news plainly, in your own words: name the company or thing and what they did, so the reader gets the story from your first line or two. Factual and short.
2. Then give YOUR genuine reaction: what you actually think, or how it landed. Honest, personal, a little understated. Lines like "kind of felt this coming", "not surprised honestly", "this is the part that gets me", "been saying this for a while", "kind of grim", "wild". Ground it in the real detail, never vague. It can trail off with "..." if that is the natural beat.

VOICE MODEL, hit exactly this register (news stated, then a real reaction):
"Bluelearn is shutting down their operations and will no longer be functional. I kind of felt this coming....."

RULES:
- No em dashes. Under 280 characters. No hashtags, no emoji, no thread bait.
- Do NOT force a punchline or a neat symmetrical closer. Understated and honest beats clever. A reaction that just trails off is fine.
- Contractions and lowercase are fine. Slightly rough and human beats polished.
- The reaction is a real opinion or feeling, not an analyst's "insight" and not a hot-take written for engagement.

BAD (hides the news, strains to sound smart): "A million satellites to run inference in orbit, and the number nobody's answering is the waste heat. A thermal problem cosplaying as a compute story."
  Why bad: never plainly says what happened, and it is performing a clever take.
GOOD (states the news, then an honest reaction): "Musk merged xAI into SpaceX and filed to put a million AI-compute satellites in orbit. Wild, and very on brand. I've stopped betting against him, but the heat and bandwidth math on this one really doesn't look real to me..."

TODAY'S STORIES:
${itemsList}

POSTS OTHER PEOPLE MADE THAT YOU COULD REPLY TO:
${targetsList}

For each reply: read what they actually said and give one honest, personal reaction, same plain understated voice. Agree and add something real, or push back for real. Never "great point", never just restate their post, no em dashes, under 280 chars.

Return ONLY a JSON object, no prose around it:
{
  "selected_slug": "<slug of the single most interesting story to post about>",
  "post": "<the post: news stated plainly, then your honest reaction>",
  "candidates": [ {"slug":"<slug>","draft":"<a post, same news-then-reaction shape>"}, ... up to 5, most interesting first ],
  "replies": [ "<reply to post 1>", ... exactly ${targets.length} in order ]
}`;
}

// Fallback drafts if Claude is unavailable, so the pipeline still produces a packet.
function fallbackDrafts(items, targets) {
  const top = items[0];
  return {
    selected_slug: top?.slug,
    post: deDash(top?.title || "Today in AI").slice(0, 270),
    candidates: items.slice(0, 5).map((it) => ({ slug: it.slug, draft: deDash(it.title).slice(0, 270) })),
    replies: targets.map(() => ""),
  };
}

// ---- email ------------------------------------------------------------------
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function renderEmail({ reviewUrl, post, candidates, replies, targets, slot, dateISO }) {
  const cand = candidates.map((c) => `<li style="margin:0 0 6px"><b>${esc(c.title || c.slug)}</b></li>`).join("");
  const reps = targets.map((t, i) => `<div style="padding:8px 0;border-bottom:1px solid #e6dcc4"><div style="color:#6a6052;font-size:12px">@${esc(t.authorHandle)}</div><div style="font-size:13px;color:#3a342a">${esc((t.text || "").slice(0, 160))}</div><div style="font-size:13px;color:#1b1712;margin-top:3px"><b>Draft reply:</b> ${esc(replies[i] || "(write your own)")}</div></div>`).join("");
  return `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#1b1712">
    <div style="font-family:monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#9c2b1d">Wortins on Bluesky · ${esc(slot)} · ${esc(dateISO)}</div>
    <h2 style="font-size:18px;margin:8px 0 4px">Your take, ready to review</h2>
    <div style="background:#fbf6e9;border:1px solid #d8ccb2;border-radius:8px;padding:12px 14px;font-size:15px;line-height:1.5">${esc(post)}</div>
    <p style="font-size:13px;color:#6a6052;margin:14px 0 4px">Other stories you could post instead:</p>
    <ul style="font-size:14px;padding-left:18px;margin:0">${cand}</ul>
    <h3 style="font-size:15px;margin:20px 0 6px">5 posts to reply to</h3>
    ${reps}
    <div style="text-align:center;margin:26px 0">
      <a href="${reviewUrl}" style="background:#9c2b1d;color:#f3ecda;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:700">Review &amp; post →</a>
    </div>
    <p style="font-size:12px;color:#938a76">Edit anything on the page before it posts. Nothing goes out until you click Post.</p>
  </div>`;
}

async function sendEmail(subject, html) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: MAIL_FROM, to: [MAIL_TO], subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
}

// ---- main -------------------------------------------------------------------
async function main() {
  if (!SERVICE_KEY) die("SUPABASE_SERVICE_KEY required");
  const slot = currentSlot();
  const dateISO = new Date().toISOString().slice(0, 10);
  console.log(`→ Preparing ${slot} packet for ${dateISO}`);

  // A DRY_RUN only drafts + prints: never skip (so you can always preview) and
  // never delete (so a preview can't wipe the current live packet).
  if (!DRY_RUN) {
    if (!FORCE) {
      const existing = await sb(`bluesky_queue?run_date=eq.${dateISO}&slot=eq.${slot}&select=id,status`);
      if (existing?.length) { console.log(`✓ ${slot} ${dateISO} already prepared (${existing[0].status}). Skipping (FORCE=1 to redo).`); return; }
    } else {
      // FORCE: clear any existing packet for this slot so we re-insert cleanly.
      await sb(`bluesky_reply_queue?run_date=eq.${dateISO}&slot=eq.${slot}`, { method: "DELETE" }).catch(() => {});
      await sb(`bluesky_queue?run_date=eq.${dateISO}&slot=eq.${slot}`, { method: "DELETE" }).catch(() => {});
    }
  }

  // 1. Content
  const latest = await sb("items?is_active=eq.true&edition_date=not.is.null&select=edition_date&order=edition_date.desc&limit=1");
  const editionDate = latest?.[0]?.edition_date;
  if (!editionDate) die("No edition found");
  const items = await sb(`items?is_active=eq.true&edition_date=eq.${editionDate}&section=eq.daily&select=slug,title,summary,wortins_take,rank&order=rank.asc&limit=12`);
  if (!items?.length) die(`No daily items for ${editionDate}`);

  // 2. Reply targets
  let targets = [];
  try { targets = await findReplyTargets({ limit: 5 }); } catch (e) { console.warn(`⚠ search failed: ${e.message}`); }
  console.log(`→ ${items.length} stories · ${targets.length} reply targets`);

  // 3. Drafts
  const drafted = (targets.length ? claudeJSON(buildPrompt(items, targets)) : null) || fallbackDrafts(items, targets);
  const bySlug = Object.fromEntries(items.map((it) => [it.slug, it]));
  const candidates = (drafted.candidates || []).map((c) => ({ slug: c.slug, title: bySlug[c.slug]?.title || c.slug, summary: bySlug[c.slug]?.summary || "", draft_text: deDash(c.draft || "") }));
  const postText = deDash(drafted.post || candidates[0]?.draft_text || items[0].title);
  const selectedSlug = drafted.selected_slug || items[0].slug;

  console.log("─".repeat(56));
  console.log(`POST: ${postText}`);
  drafted.replies?.forEach((r, i) => console.log(`REPLY ${i + 1} -> @${targets[i]?.authorHandle}: ${deDash(r)}`));
  console.log("─".repeat(56));

  if (DRY_RUN) { console.log("\n[DRY RUN] Nothing written or emailed."); return; }

  // 4. Write the queues
  const [queued] = await sb("bluesky_queue", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ run_date: dateISO, slot, status: "pending", draft_text: postText, candidates, selected_slug: selectedSlug }),
  });
  const queueId = queued?.id;
  if (targets.length) {
    await sb("bluesky_reply_queue", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify(targets.map((t, i) => ({
        run_date: dateISO, slot, target_uri: t.uri, target_cid: t.cid, target_author: t.authorHandle,
        target_text: (t.text || "").slice(0, 500), target_url: t.url, draft_reply: deDash(drafted.replies?.[i] || ""), status: "pending",
      }))),
    });
  }

  // 5. Email the review link
  const reviewUrl = `${SITE_URL}/social?id=${queueId}&key=${encodeURIComponent(REVIEW_SECRET)}`;
  const html = renderEmail({ reviewUrl, post: postText, candidates, replies: drafted.replies || [], targets, slot, dateISO });
  await sendEmail(`Your Bluesky drafts · ${slot} · ${dateISO}`, html);
  console.log(`✓ Prepared. Review: ${reviewUrl.replace(REVIEW_SECRET, "…")}`);
}

main().catch((e) => die(e.message));
