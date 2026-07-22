#!/usr/bin/env node
// Auto-schedules the day's top Bluesky POSTS for a morning/afternoon/evening slot.
//
// Flow (3x/day, fully automatic):
//   1. Read the latest edition's top daily items from Supabase.
//   2. Draft, in one Claude call, a clear "news then honest reaction" post for
//      the top stories (uses the `claude` CLI + CLAUDE_CODE_OAUTH_TOKEN).
//   3. Schedule the top 3 into bluesky_scheduled at 0/60/120 min; the drip
//      endpoint posts each when due, with a link card to its /story/<slug> page.
//
// Replies are handled separately by bluesky-replies.mjs (spread through the day).
// Nothing is emailed and nothing needs approval. Only real Claude drafts ship.
// Idempotent per (run_date, slot). Self-contained: global fetch + the claude CLI.
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY   (service role)
//   DRAFT_MODEL          optional claude model override (blank = account default)
//   SLOT                 morning|afternoon|evening (else derived from UTC hour)
//   DRY_RUN=1            draft + print, schedule nothing
//   FORCE=1              re-schedule even if this slot already has posts

import { execFileSync } from "node:child_process";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://zrjbzowohsgjbrhsldfi.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const DRAFT_MODEL = process.env.DRAFT_MODEL || "";
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

async function sb(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const body = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`Supabase ${init.method || "GET"} ${path} -> ${res.status} ${body.slice(0, 200)}`);
  return body ? JSON.parse(body) : null;
}

function claudeJSON(prompt) {
  try {
    const args = ["-p", prompt, "--output-format", "text"];
    if (DRAFT_MODEL) args.splice(2, 0, "--model", DRAFT_MODEL);
    const out = execFileSync("claude", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 180000, env: process.env });
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no JSON in claude output");
    return JSON.parse(m[0]);
  } catch (e) {
    console.warn(`⚠ claude drafting unavailable (${e.message}).`);
    return null;
  }
}

function buildPrompt(items) {
  const itemsList = items
    .map((it, i) => `${i + 1}. slug: ${it.slug}\nHEADLINE: ${it.title}\nEDITORIAL TAKE (where the real, specific point lives, mine on this story): ${deDash(it.wortins_take || it.summary || "")}`)
    .join("\n\n");

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

Return ONLY a JSON object, no prose around it:
{
  "candidates": [ {"slug":"<slug>","draft":"<the post: what happened stated clearly, then a specific honest reaction or nothing>"}, ... up to 5, most interesting first ]
}`;
}

function fallbackDrafts(items) {
  return { candidates: items.slice(0, 5).map((it) => ({ slug: it.slug, draft: deDash(it.title).slice(0, 270) })) };
}

// ---- main -------------------------------------------------------------------
async function main() {
  if (!SERVICE_KEY) die("SUPABASE_SERVICE_KEY required");
  const slot = currentSlot();
  const dateISO = new Date().toISOString().slice(0, 10);
  console.log(`→ Preparing ${slot} posts for ${dateISO}`);

  if (!DRY_RUN) {
    if (!FORCE) {
      const existing = await sb(`bluesky_scheduled?run_date=eq.${dateISO}&slot=eq.${slot}&kind=eq.post&select=id&limit=1`);
      if (existing?.length) { console.log(`✓ ${slot} ${dateISO} already scheduled. Skipping (FORCE=1 to redo).`); return; }
    } else {
      await sb(`bluesky_scheduled?run_date=eq.${dateISO}&slot=eq.${slot}&kind=eq.post&status=eq.pending`, { method: "DELETE" }).catch(() => {});
    }
  }

  // 1. Content
  const latest = await sb("items?is_active=eq.true&edition_date=not.is.null&select=edition_date&order=edition_date.desc&limit=1");
  const editionDate = latest?.[0]?.edition_date;
  if (!editionDate) die("No edition found");
  const items = await sb(`items?is_active=eq.true&edition_date=eq.${editionDate}&section=eq.daily&select=slug,title,summary,wortins_take,rank&order=rank.asc&limit=12`);
  if (!items?.length) die(`No daily items for ${editionDate}`);

  // Skip stories already scheduled earlier today so later slots carry fresh news.
  const already = await sb(`bluesky_scheduled?run_date=eq.${dateISO}&kind=eq.post&select=story_slug`).catch(() => []);
  const usedSlugs = new Set((already || []).map((r) => r.story_slug));
  const freshPool = items.filter((it) => !usedSlugs.has(it.slug));
  const stories = freshPool.length ? freshPool : items;
  console.log(`→ ${stories.length} fresh stories of ${items.length}`);

  // 2. Draft the top posts.
  const ai = claudeJSON(buildPrompt(stories));
  const drafted = ai || fallbackDrafts(stories);
  const isAI = !!ai;
  const bySlug = Object.fromEntries(stories.map((it) => [it.slug, it]));
  const candidates = (drafted.candidates || []).map((c) => ({ slug: c.slug, draft_text: deDash(c.draft || "") }));
  const posts = candidates.filter((c) => c.slug && bySlug[c.slug] && c.draft_text).slice(0, 3);

  console.log("─".repeat(56));
  posts.forEach((p, i) => console.log(`POST ${i + 1}: ${p.draft_text}`));
  console.log("─".repeat(56));

  if (DRY_RUN) { console.log("\n[DRY RUN] Nothing scheduled."); return; }
  if (!isAI) { console.log("⚠ Claude drafting unavailable; skipping this slot (nothing posted)."); return; }
  if (!posts.length) { console.log("Nothing to schedule."); return; }

  // 3. Schedule the posts 0/60/120 min apart; the drip endpoint posts each.
  const base = Date.now();
  const rows = posts.map((c, i) => ({
    run_date: dateISO, slot, kind: "post", story_slug: c.slug, reply_uri: null, reply_cid: null,
    text: c.draft_text, scheduled_for: new Date(base + i * 60 * 60000).toISOString(), status: "pending",
  }));
  await sb("bluesky_scheduled", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(rows) });
  console.log(`✓ Auto-scheduled ${rows.length} posts for ${slot} ${dateISO}.`);
}

main().catch((e) => die(e.message));
