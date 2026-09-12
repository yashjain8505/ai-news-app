#!/usr/bin/env node
// Replies on X to the conversations around today's stories, via Typefully.
//
// Typefully can post a reply (platforms.x.settings.reply_to_url) but cannot
// find tweets, and X's own search costs money. So targets come from two free
// sources:
//   A. the article itself: publishers embed the original announcement tweet,
//      and that thread is where the conversation about the story lives;
//   B. a web search (Serper, Google results) for `<headline> site:x.com`,
//      which surfaces ordinary people talking about the story. Optional:
//      no SERPER_API_KEY means source A only.
// A tweet's text is read through X's public syndication endpoint, so every
// reply is written against what the person actually said.
//
// REPLIES ARE DRAFTS, BY X'S RULE. Typefully refuses to publish or schedule
// a reply via the API (403: "not allowed by X policy"); X's automation rules
// forbid unsolicited automated replies, and posting them through the raw X
// API would risk the account. So each reply lands in Typefully as a draft
// with the target attached, and the user publishes it with one tap in the
// Typefully app. That tap is what makes it a human reply.
//
// Voice: the house voice, plus a spine. Source-tweet replies add the fact or
// angle the announcement left out. Search replies take a clear position and
// say the uncomfortable true thing; a good one makes people want to argue
// back. Never an insult, never an invented fact, never a link.
//
// Env:
//   SUPABASE_SERVICE_KEY   ledger reads/writes (x_replies_ledger, social_posts_ledger, items)
//   TYPEFULLY_API_KEY      posting; absent => no-op
//   CLAUDE_CODE_OAUTH_TOKEN drafting via the claude CLI
//   SERPER_API_KEY         optional, enables source B
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID  optional; one alert per run listing the drafts to tap
//   MAX_REPLIES            per run (default 4)
//   OWN_HANDLE             our X handle, never replied to (default Wortinscom)
//   DRY_RUN=1              find + draft + print, post nothing
//
// A growth extra: every failure path logs and exits 0.

import { execFileSync } from "node:child_process";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://zrjbzowohsgjbrhsldfi.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const TF_KEY = process.env.TYPEFULLY_API_KEY;
const SERPER_KEY = process.env.SERPER_API_KEY || "";
const MAX_REPLIES = Number(process.env.MAX_REPLIES || 4);
const OWN_HANDLE = (process.env.OWN_HANDLE || "Wortinscom").toLowerCase();
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const DRAFT_MODEL = process.env.DRAFT_MODEL || "";
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || "";
const MAX_TWEET_AGE_H = 72;
const CANDIDATES_PER_STORY = 8;
// Accounts that only relay headlines: replying there is talking to a feed.
const RELAY_RE = /techmeme|news|daily|wire|headlines|breaking|bot$|alerts?$|feed$/i;

// Where is a reply worth making? Where people already are (likes, replies),
// where the author is a person with an opinion rather than a relay account,
// and, for source tweets, the announcement itself.
function worth(t) {
  let score = Math.log10(1 + t.likes) * 20 + Math.log10(1 + t.replies) * 30;
  if (t.verified) score += 10;
  if (t.source === "article") score += 25;
  if (RELAY_RE.test(t.author) || RELAY_RE.test(t.name)) score -= 30;
  if (/\b(I|I'm|I've|my|me|we|honestly|imagine|why|wtf|lol|wild|insane|crazy|scary|wrong|nope|finally|can't|don't|should)\b/i.test(t.text)) score += 12;
  if (t.text.includes("?")) score += 6;
  return score;
}

const warn = (m) => console.warn(`⚠ ${m}`);
const skip = (m) => { console.log(`→ ${m}`); process.exitCode = 0; };
const UA = "Mozilla/5.0 (compatible; WortinsBot/1.0)";

async function sb(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const body = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`Supabase ${init.method || "GET"} ${path} -> ${res.status} ${body.slice(0, 200)}`);
  return body ? JSON.parse(body) : null;
}

async function tf(path, init = {}) {
  const res = await fetch(`https://api.typefully.com${path}`, {
    redirect: "follow", ...init,
    headers: { Authorization: `Bearer ${TF_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const body = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`Typefully ${init.method || "GET"} ${path} -> ${res.status} ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : null;
}

const deDash = (s) => String(s ?? "").replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2").replace(/\s*[–—]\s*/g, ", ").replace(/\s+/g, " ").trim();
const headlineOf = (it) => deDash(it.plain_title || it.title);
const TWEET_RE = /https?:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{8,25})/g;

// ---- finding tweets ---------------------------------------------------------

async function tweetsInArticle(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const html = await res.text();
    const seen = new Map();
    for (const m of html.matchAll(TWEET_RE)) if (!seen.has(m[2])) seen.set(m[2], { id: m[2], author: m[1], source: "article" });
    return [...seen.values()];
  } catch (e) {
    warn(`article fetch failed (${url.slice(0, 60)}): ${e.message}`);
    return [];
  }
}

async function tweetsFromSearch(story) {
  if (!SERPER_KEY) return [];
  try {
    const q = `${headlineOf(story).replace(/["']/g, "")} site:x.com`;
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": SERPER_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q, num: 10, tbs: "qdr:w" }), // num > 10 is rejected (400) on this plan
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`serper -> ${res.status}`);
    const data = await res.json();
    const seen = new Map();
    for (const r of data.organic || []) {
      for (const m of String(r.link || "").matchAll(TWEET_RE)) if (!seen.has(m[2])) seen.set(m[2], { id: m[2], author: m[1], source: "search" });
    }
    return [...seen.values()];
  } catch (e) {
    warn(`search failed for "${headlineOf(story).slice(0, 40)}": ${e.message}`);
    return [];
  }
}

// X's syndication endpoint returns a tweet's text and author without auth.
async function readTweet(id) {
  try {
    const res = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=a`, {
      headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    if (!d?.text || !d?.user?.screen_name) return null;
    return {
      id: String(d.id_str || id),
      author: d.user.screen_name,
      name: d.user.name || d.user.screen_name,
      text: String(d.text).replace(/https:\/\/t\.co\/\S+/g, "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim(),
      created: d.created_at ? new Date(d.created_at) : null,
      isReply: Boolean(d.parent || d.in_reply_to_status_id_str),
      likes: Number(d.favorite_count || 0),
      replies: Number(d.conversation_count || 0),
      verified: Boolean(d.user.is_blue_verified || d.user.verified),
    };
  } catch {
    return null;
  }
}

// ---- drafting ----------------------------------------------------------------

function replyPrompt(targets) {
  const list = targets.map((t, i) => `${i + 1}. tweet_id: ${t.id} [${t.source === "article" ? "SOURCE TWEET, embedded in the article" : "SEARCH: an ordinary person discussing the story"}]
@${t.author} (${t.name}${t.verified ? ", verified" : ""}; ${t.likes} likes, ${t.replies} replies) wrote: "${t.text.replace(/\s+/g, " ").slice(0, 600)}"
THE STORY: ${headlineOf(t.story)}
WHAT WE KNOW (our take): ${deDash(t.story.wortins_take || t.story.plain_line || t.story.summary || "")}`).join("\n\n");

  return `You write X replies for the person behind Wortins, an independent AI-news brief: one real person who knows the story cold and says what they actually think. Not a brand, not a cheerleader.

Below are tweets about today's stories. Write a reply to each one that is worth replying to; skip any where you would only be agreeing or repeating the tweet. Return at most ${MAX_REPLIES}, the strongest first.

EVERY REPLY:
- 270 characters or fewer, hard limit. Plain full sentences.
- WRITE FOR A NORMAL PERSON, not an AI researcher. This is the rule people break most. Talk the way you would to a smart friend at dinner who does not follow AI: short sentences, everyday words, ONE clear point. No jargon, no acronyms, no names of documents or policies ("system card", "the CAIS statement", "GDM", "alignment", "frontier models", "RLHF"). If the fact needs a technical thing, say what it IS in plain words ("the report OpenAI published about its own model", "a one-line letter signed by the top AI bosses"). Test: would your mum follow this reply? If not, rewrite it simpler.
- The fact you bring must be the kind a person would repeat to someone else, not a citation. Dates and names only when they make the point land.

SOUND LIKE A PERSON TYPING ON THEIR PHONE, NOT LIKE AN ESSAY. The user published one of these and said it "felt really, really AI". These are the tells, and they are banned:
- The tidy contrast: "X isn't the problem. Y is." / "It's not A, it's B." / "That's not a bug, it's the point."
- The knowing closer: "That's the part worth sitting with." / "The real question is..." / "That gap tells you everything." / "Same story, different name."
- Restating their tweet back to them before answering, or a colon-led reveal ("Here's the thing:").
- Three neat parallel clauses, perfectly balanced sentences, every reply the same shape.
- Opening with the fact like a news anchor.
What a real reply looks like instead: uneven. Sometimes one blunt sentence. Sometimes a fact then a shrug. Fragments are fine. Contractions always. React the way you'd talk: "yeah, and", "the bit nobody mentions is", "I'd have said the same until", "honestly", "no chance", "which, fine, but". Say one thing, say it plainly, stop. Don't wrap it up.
Examples of the register (do not copy the words, copy the looseness):
  AI: "The CAPTCHA isn't the barrier, the willingness to deceive is. That's the part worth noting."
  Human: "it beat the captcha in 2023 by paying a guy on TaskRabbit and telling him it was blind. captchas were never the hard part"
  AI: "This report is transparency and rebuttal in equal measure. Both things can be true."
  Human: "worth knowing this dropped two days after one of their own researchers quit saying the company was moving too fast. timing's not an accident"
  Human: "$62m for AI heart-failure bots from one agency while another agency says AI bots are flooding its claims desk. nobody's talking to each other over there"
Capitalisation and full stops are optional; write it the way it comes out.
- Written to THIS tweet: react to what this person said, with specifics from the story (numbers, names, dates, what was actually said). Someone reading the reply cold should learn something.
- Never "great post", never a restatement of the tweet, never a compliment, never a question asked to farm replies, no hashtags, no emoji, no links, no em dashes, no "thread below".
- Never a tacked-on profound closer that could sit under any story. If the last line fits anywhere, cut it.

FOR A SOURCE TWEET (a company or person announcing the thing): add the fact or the angle the announcement left out, the part the announcement would rather you did not notice, stated plainly and fairly.

FOR A SEARCH TWEET (an ordinary person reacting): TAKE A POSITION. Say the uncomfortable true thing, in plain words. If they are wrong, say so plainly and say why, with the one fact that proves it. If they are right, sharpen it with something they did not know. A good reply is one people want to argue with. Confident, simple, a little provocative; casual is fine. But: argue with the CLAIM, never with the person's motives (no "you're hoping", "you're hedging", "you just want"); never insult or mock them, never invent a fact, never put words in their mouth.

TWEETS:
${list}

Return ONLY JSON: {"replies":[{"tweet_id":"<id>","text":"<the reply>"}]}`;
}

function claudeReplies(targets) {
  try {
    const args = ["-p", replyPrompt(targets), "--output-format", "text"];
    if (DRAFT_MODEL) args.splice(2, 0, "--model", DRAFT_MODEL);
    const out = execFileSync("claude", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 300000, env: process.env });
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no JSON in claude output");
    const parsed = JSON.parse(m[0]);
    const clean = (t) => String(t || "").replace(/https?:\/\/\S+/g, "").replace(/\s*[–—]\s*/g, ", ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    const out2 = [];
    for (const r of Array.isArray(parsed.replies) ? parsed.replies : []) {
      const text = clean(r.text);
      if (!text || text.length > 275 || /#|@\w+/.test(text)) continue;
      out2.push({ tweet_id: String(r.tweet_id || ""), text });
    }
    return out2;
  } catch (e) {
    const raw = (e.stderr && String(e.stderr).trim()) || "";
    warn(`claude drafting unavailable: ${raw ? raw.slice(0, 200) : String(e.message).replace(/Command failed: claude[\s\S]*/, "claude exited non-zero")}`);
    return [];
  }
}

// ---- the alert ---------------------------------------------------------------

// X's rule means a human taps Publish on each reply, so the run ends with one
// Telegram message: what was found, who it answers, and the link that opens
// the draft. Best-effort, never fails the run.
async function telegram(items) {
  if (!TG_TOKEN || !TG_CHAT || !items.length) return;
  const esc = (t) => String(t).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  const lines = items.map((it, i) =>
    `<b>${i + 1}. @${esc(it.author)}</b> ${it.source === "article" ? "(the original announcement)" : "(someone discussing it)"}\n` +
    `<i>${esc(it.tweetText.replace(/\s+/g, " ").slice(0, 140))}${it.tweetText.length > 140 ? "…" : ""}</i>\n` +
    `↳ ${esc(it.reply)}\n` +
    `<a href="${it.draftUrl}">Open in Typefully → tap Publish</a>`);
  const text = `💬 <b>${items.length} X repl${items.length === 1 ? "y" : "ies"} ready to publish</b>\n\n${lines.join("\n\n")}\n\nDelete any you don't like. Each one is a draft until you tap.`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) throw new Error(JSON.stringify(json).slice(0, 200));
    console.log(`  ✓ Telegram alert sent (${items.length} draft(s))`);
  } catch (e) {
    warn(`telegram alert failed: ${e.message}`);
  }
}

// /today lists the replies still waiting for a tap. Each run first asks
// Typefully what became of the earlier drafts, so published or deleted ones
// drop off that list.
async function syncDraftStatuses(day) {
  const rows = await sb(`x_replies_ledger?status=eq.draft&select=id,draft_id&draft_id=neq.`);
  if (!rows?.length) return;
  const sets = await tf("/v2/social-sets");
  const setList = Array.isArray(sets) ? sets : sets?.results || [];
  const xSetId = (await Promise.all(setList.map((s) => tf(`/v2/social-sets/${s.id}/`).catch(() => null)))).find((d) => d?.platforms?.x)?.id;
  if (!xSetId) return;
  const byId = new Map();
  for (const status of ["draft", "published", "scheduled"]) {
    const list = await tf(`/v2/social-sets/${xSetId}/drafts?status=${status}&limit=50`).catch(() => null);
    for (const d of (Array.isArray(list) ? list : list?.results || [])) byId.set(String(d.id), status);
  }
  for (const r of rows) {
    const st = byId.get(String(r.draft_id));
    const next = st === "published" ? "published" : st ? "draft" : "gone";
    if (next === "draft") continue;
    await sb(`x_replies_ledger?id=eq.${r.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: next }) });
  }
}

// ---- main --------------------------------------------------------------------

async function main() {
  if (!SUPABASE_KEY) return skip("No Supabase key; skipping.");
  if (!TF_KEY) return skip("TYPEFULLY_API_KEY is not set; nothing to post with.");
  const day = new Date().toISOString().slice(0, 10);

  // Today's stories = what the waves posted today, so replies sit next to the
  // posts already out there. Falls back to the top of the latest edition.
  let slugs = (await sb(`social_posts_ledger?day=eq.${day}&select=slug`).catch(() => [])).map((r) => r.slug);
  slugs = [...new Set(slugs)];
  let stories = [];
  if (slugs.length) {
    stories = await sb(`items?slug=in.(${slugs.map((s) => `"${s}"`).join(",")})&select=slug,title,plain_title,plain_line,summary,wortins_take,url,rank`);
  } else {
    const rows = await sb("items?is_active=eq.true&edition_date=not.is.null&select=edition_date&order=edition_date.desc&limit=1");
    const date = rows?.[0]?.edition_date;
    if (date) stories = await sb(`items?is_active=eq.true&edition_date=eq.${date}&section=eq.daily&select=slug,title,plain_title,plain_line,summary,wortins_take,url,rank&order=rank.asc&limit=6`);
  }
  if (!stories.length) return skip("No stories to find conversations for.");
  console.log(`→ ${stories.length} story(ies) to look around · sources: article${SERPER_KEY ? " + search" : " only (no SERPER_API_KEY)"}`);

  const done = await sb(`x_replies_ledger?select=tweet_id,author,day`).catch(() => []);
  await syncDraftStatuses(day).catch((e) => warn(`status sync skipped: ${e.message}`));
  const doneIds = new Set(done.map((r) => r.tweet_id));
  const authorsToday = new Set(done.filter((r) => r.day === day).map((r) => r.author.toLowerCase()));

  const sets = await tf("/v2/social-sets");
  const setList = Array.isArray(sets) ? sets : sets?.results || [];
  const details = await Promise.all(setList.map((s) => tf(`/v2/social-sets/${s.id}/`).catch(() => null)));
  const xSet = details.find((d) => d?.platforms?.x);
  if (!xSet) return skip("No social set with X connected.");

  // Find candidates, read them, filter.
  const targets = [];
  const cutoff = Date.now() - MAX_TWEET_AGE_H * 3600 * 1000;
  for (const story of stories) {
    const found = [...await tweetsInArticle(story.url), ...await tweetsFromSearch(story)];
    let kept = 0;
    for (const c of found) {
      if (kept >= CANDIDATES_PER_STORY) break;
      if (doneIds.has(c.id) || c.author.toLowerCase() === OWN_HANDLE || authorsToday.has(c.author.toLowerCase())) continue;
      const t = await readTweet(c.id);
      if (!t || t.isReply || t.text.length < 40) continue;
      if (t.created && t.created.getTime() < cutoff) continue;
      if (t.author.toLowerCase() === OWN_HANDLE) continue;
      targets.push({ ...t, source: c.source, story });
      doneIds.add(c.id);
      kept++;
    }
    console.log(`  ${headlineOf(story).slice(0, 60)}: ${found.length} found, ${kept} usable`);
  }
  if (!targets.length) return skip("No fresh conversations to join this run.");
  targets.sort((a, b) => worth(b) - worth(a));
  console.log(`→ ${targets.length} candidate(s); top: ${targets.slice(0, 5).map((t) => `@${t.author} (${t.likes}♥ ${t.replies}↩)`).join(", ")}`);

  const drafts = claudeReplies(targets.slice(0, MAX_REPLIES * 2));
  if (!drafts.length) return skip("Nothing drafted.");

  let posted = 0;
  const repliedAuthors = new Set();
  const alertItems = [];
  for (const d of drafts) {
    if (posted >= MAX_REPLIES) break;
    const t = targets.find((x) => x.id === d.tweet_id);
    if (!t || repliedAuthors.has(t.author.toLowerCase())) continue;
    const url = `https://x.com/${t.author}/status/${t.id}`;
    console.log(`\n→ reply draft for @${t.author} [${t.source}] ${url}\n  "${t.text.slice(0, 120).replace(/\s+/g, " ")}"\n  ↳ ${d.text}`);
    if (DRY_RUN) { posted++; repliedAuthors.add(t.author.toLowerCase()); continue; }
    try {
      const created = await tf(`/v2/social-sets/${xSet.id}/drafts`, {
        method: "POST",
        body: JSON.stringify({
          draft_title: `Reply · @${t.author} · ${day}`,
          platforms: { x: { enabled: true, posts: [{ text: d.text }], settings: { reply_to_url: url } } },
        }),
      });
      await sb("x_replies_ledger", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ day, tweet_id: t.id, tweet_url: url, author: t.author, slug: t.story.slug, source: t.source, draft_id: String(created?.id || ""), draft_url: created?.private_url || `https://typefully.com/?d=${created?.id}&a=${xSet.id}`, reply_text: d.text }),
      });
      const draftUrl = created?.private_url || `https://typefully.com/?d=${created?.id}`;
      console.log(`  ✓ draft ready to publish: ${draftUrl}`);
      alertItems.push({ author: t.author, source: t.source, tweetText: t.text, reply: d.text, draftUrl });
      posted++;
      repliedAuthors.add(t.author.toLowerCase());
    } catch (e) {
      warn(`reply to @${t.author} failed: ${e.message}`);
    }
  }
  console.log(`\n→ ${posted} reply draft(s) ${DRY_RUN ? "would be " : ""}created; publish them from the Typefully app`);
  await telegram(alertItems);
}

main().catch((e) => { warn(e.message); process.exitCode = 0; });
