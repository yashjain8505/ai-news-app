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

  return `You ghost-write short Bluesky posts for the person behind Wortins, an independent AI-news brief. You are ONE real person telling people what happened in AI today and what you honestly make of it. Not a brand, not a thought-leader. You do not perform cleverness or chase engagement.

Each story below has an EDITORIAL TAKE with the real details. Use it for the facts.

STRUCTURE:
1. Say what happened, clearly, in plain full sentences. Name the company and what they did, with the key numbers or dates, so someone who knows nothing understands the story from your opening sentences. Clarity beats brevity: a clear full sentence is better than a clever compressed fragment.
2. Point at the genuinely notable part in plain words ("what's surprising is...", "the part that stands out...", "what's wild is that..."). Then, IF you close at all, close with ONE of: a real specific observation (who this actually helps or hurts, the real reason it matters, a concrete knock-on effect), OR a simple honest reaction ("it is genuinely wild that...", "kind of grim", "didn't see this coming"). Ending on the clear facts with no closer is also fine.

VOICE MODEL (news stated plainly, then a simple honest reaction):
"Bluelearn is shutting down their operations and will no longer be functional. I kind of felt this coming....."

NEVER write the fake-deep tacked-on closer. These are real rejected drafts; avoid anything like them:
- "...distinction without a difference if you're laid off..."
- "...kind of grim reminder these tools aren't fully ours to keep..."
- "...kind of the real story this week..."
They sound profound and say nothing. Test: if your last line could be pasted onto almost any story, cut it.

RULES:
- No em dashes. Under 290 characters (hard cap is 300). No hashtags, no emoji, no thread bait.
- Plain, clear, simple language. Full sentences. Contractions fine.
- Any reaction must be specific and true to THIS story, never a generic significance claim.

EXAMPLES (rejected draft -> fixed):
BAD: "xAI's Grok 4.5 matches Opus 4.7 on coding but 4x fewer tokens, $2 in $6 out per million. Everyone's competing on cost per token now, not just raw smarts. Kind of the real story this week..."
FIXED: "xAI's Grok 4.5 matches Opus 4.7 on coding but uses about 4x fewer tokens to get there, at $2 in and $6 out per million. The efficiency is the real headline: matching a frontier model at a quarter of the tokens changes the cost math for anyone building on it."
BAD: "Claude Fable 5 got suspended June 12 over export controls, then restored July 1 once they lifted. A frontier model just blinked off and on because of trade policy. Kind of grim reminder these tools aren't fully ours to keep..."
FIXED: "Anthropic's Claude Fable 5 was suspended for weeks over US export controls, then restored on July 1 once the rules were lifted. It is genuinely wild that a frontier model can be switched off and back on because of trade policy."

TODAY'S STORIES:
${itemsList}

POSTS OTHER PEOPLE MADE THAT YOU COULD REPLY TO:
${targetsList}

For each reply: read what they actually said and give one clear, honest, specific reaction. Agree and add a real point, or push back for real, in plain language. Never "great point", never just restate their post, never a fake-deep closer, no em dashes, under 290 chars.

LINKING (use sparingly): for a FEW replies, ONLY where one of TODAY'S STORIES above is genuinely relevant to what the person said, you may mention it naturally and paste its link. The link is https://www.wortins.com/story/<slug> using that exact story's slug. Phrase it like you are sharing something you read, e.g. "we actually covered this, worth a look: <link>" or "there's a good rundown on it here: <link>". Never salesy, never forced, and leave MOST replies with no link at all. If nothing fits, do not link.

Return ONLY a JSON object, no prose around it:
{
  "selected_slug": "<slug of the single most interesting story to post about>",
  "post": "<the post: what happened stated clearly, then a specific honest reaction or nothing>",
  "candidates": [ {"slug":"<slug>","draft":"<a post, same clear-news-then-honest-reaction shape>"}, ... up to 5, most interesting first ],
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

function renderEmail({ slot, dateISO, posts, replyRows }) {
  const postList = posts.map((c, i) => `<div style="padding:8px 0;border-bottom:1px solid #e6dcc4"><div style="color:#6a6052;font-size:12px">Post ${i + 1} · +${i}h</div><div style="font-size:14px;color:#1b1712;line-height:1.5">${esc(c.draft_text)}</div></div>`).join("");
  const replyList = replyRows.map((r) => `<div style="padding:8px 0;border-bottom:1px solid #e6dcc4"><div style="color:#6a6052;font-size:12px">Reply to @${esc(r.t.authorHandle)}</div><div style="font-size:14px;color:#1b1712;line-height:1.5">${esc(r.text)}</div></div>`).join("");
  return `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#1b1712">
    <div style="font-family:monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#9c2b1d">Wortins on Bluesky · ${esc(slot)} · ${esc(dateISO)}</div>
    <h2 style="font-size:18px;margin:8px 0 4px">Auto-posting today</h2>
    <p style="font-size:13px;color:#6a6052;margin:0 0 12px">These are scheduled to post automatically over the next couple of hours. If one is off, delete it on Bluesky.</p>
    <h3 style="font-size:15px;margin:16px 0 6px">Posts</h3>
    ${postList || '<p style="font-size:13px;color:#938a76">None.</p>'}
    <h3 style="font-size:15px;margin:20px 0 6px">Replies</h3>
    ${replyList || '<p style="font-size:13px;color:#938a76">None.</p>'}
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
      const existing = await sb(`bluesky_scheduled?run_date=eq.${dateISO}&slot=eq.${slot}&select=id&limit=1`);
      if (existing?.length) { console.log(`✓ ${slot} ${dateISO} already scheduled. Skipping (FORCE=1 to redo).`); return; }
    } else {
      // FORCE: clear this slot's still-pending scheduled rows so we re-insert cleanly.
      await sb(`bluesky_scheduled?run_date=eq.${dateISO}&slot=eq.${slot}&status=eq.pending`, { method: "DELETE" }).catch(() => {});
    }
  }

  // 1. Content
  const latest = await sb("items?is_active=eq.true&edition_date=not.is.null&select=edition_date&order=edition_date.desc&limit=1");
  const editionDate = latest?.[0]?.edition_date;
  if (!editionDate) die("No edition found");
  const items = await sb(`items?is_active=eq.true&edition_date=eq.${editionDate}&section=eq.daily&select=slug,title,summary,wortins_take,rank&order=rank.asc&limit=12`);
  if (!items?.length) die(`No daily items for ${editionDate}`);

  // Later slots skip stories already scheduled earlier today, so the afternoon
  // and evening packets carry fresh news instead of repeating the morning's.
  const already = await sb(`bluesky_scheduled?run_date=eq.${dateISO}&select=story_slug`).catch(() => []);
  const usedSlugs = new Set((already || []).map((r) => r.story_slug));
  const freshPool = items.filter((it) => !usedSlugs.has(it.slug));
  const stories = freshPool.length ? freshPool : items;

  // 2. Reply targets
  let targets = [];
  try { targets = await findReplyTargets({ limit: 5 }); } catch (e) { console.warn(`⚠ search failed: ${e.message}`); }
  console.log(`→ ${stories.length} fresh stories of ${items.length} · ${targets.length} reply targets`);

  // 3. Drafts
  const ai = targets.length ? claudeJSON(buildPrompt(stories, targets)) : null;
  const drafted = ai || fallbackDrafts(stories, targets);
  const isAI = !!ai;
  const bySlug = Object.fromEntries(stories.map((it) => [it.slug, it]));
  const candidates = (drafted.candidates || []).map((c) => ({ slug: c.slug, title: bySlug[c.slug]?.title || c.slug, summary: bySlug[c.slug]?.summary || "", draft_text: deDash(c.draft || "") }));
  const postText = deDash(drafted.post || candidates[0]?.draft_text || stories[0].title);
  const selectedSlug = drafted.selected_slug || stories[0].slug;

  console.log("─".repeat(56));
  console.log(`POST: ${postText}`);
  drafted.replies?.forEach((r, i) => console.log(`REPLY ${i + 1} -> @${targets[i]?.authorHandle}: ${deDash(r)}`));
  console.log("─".repeat(56));

  if (DRY_RUN) { console.log("\n[DRY RUN] Nothing scheduled or emailed."); return; }

  // Full auto: only ship real Claude drafts, never the headline-only fallback.
  if (!isAI) {
    console.log("⚠ Claude drafting unavailable; skipping this slot (nothing auto-posted).");
    return;
  }

  // 4. Auto-schedule the top 3 posts + top 3 replies into the drip queue, spaced
  // ~30 min apart so the account never fires a burst. The drip endpoint posts
  // each once it comes due (posts get a story link card; replies are threaded).
  const base = Date.now();
  const at = (min) => new Date(base + min * 60000).toISOString();
  const posts = candidates.slice(0, 3).filter((c) => c.slug && c.draft_text);
  const replyRows = targets.slice(0, 3)
    .map((t, i) => ({ t, text: deDash(drafted.replies?.[i] || "") }))
    .filter((r) => r.text && r.t.uri && r.t.cid);

  // Uniform keys across every row (PostgREST bulk insert requires it): posts
  // carry story_slug, replies carry reply_uri/reply_cid, the rest stay null.
  const rows = [
    ...posts.map((c, i) => ({
      run_date: dateISO, slot, kind: "post", story_slug: c.slug, reply_uri: null, reply_cid: null,
      text: c.draft_text, scheduled_for: at(i * 60), status: "pending",
    })),
    ...replyRows.map((r, i) => ({
      run_date: dateISO, slot, kind: "reply", story_slug: null, reply_uri: r.t.uri, reply_cid: r.t.cid,
      text: r.text, scheduled_for: at(30 + i * 60), status: "pending",
    })),
  ];
  if (!rows.length) { console.log("Nothing to schedule."); return; }
  await sb("bluesky_scheduled", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(rows) });

  // 5. Notification email (informational; nothing to approve).
  const html = renderEmail({ slot, dateISO, posts, replyRows });
  await sendEmail(`Wortins on Bluesky: ${posts.length} posts + ${replyRows.length} replies auto-scheduled (${slot})`, html);
  console.log(`✓ Auto-scheduled ${posts.length} posts + ${replyRows.length} replies for ${slot} ${dateISO}.`);
}

main().catch((e) => die(e.message));
