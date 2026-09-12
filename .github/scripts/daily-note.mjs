#!/usr/bin/env node
// Turns the day's edition into a Substack Note, via Typefully.
//
// Substack has no official write API and its internal one sits behind
// Cloudflare, which challenges datacenter IPs (i.e. GitHub Actions). Typefully
// is an official Substack integration, so it is the one path that lets CI touch
// Substack at all. It publishes Substack *Notes* only (the API caps the
// platform at a single note), which is exactly the half worth automating: notes
// are the discovery surface and are posted many times a week, while the long
// newsletter post stays a 30-second paste from /today.
//
// DEFAULT IS A DRAFT, ON PURPOSE. Omitting `publish_at` saves the note as a
// Typefully draft: nothing goes public without a human, and it costs none of
// the account's monthly publishing quota (10 on the current plan, which daily
// auto-publishing would blow past in under two weeks). Publishing is then one
// tap in Typefully. Set NOTES_MODE=queue (next free slot) or NOTES_MODE=now to
// escalate to real auto-publishing once the quota allows it.
//
// Env:
//   SUPABASE_URL              (default: the project URL below)
//   SUPABASE_SERVICE_KEY      service-role key (CI); SUPABASE_ANON_KEY works for DRY_RUN
//   TYPEFULLY_API_KEY         v2 key from Typefully > Settings > Integrations.
//                             Absent => the script no-ops (exit 0).
//   TYPEFULLY_SOCIAL_SET_ID   optional; auto-discovered when there is one set
//   NOTES_MODE                draft (default) | queue | now
//   SITE_URL                  (default https://www.wortins.com)
//   EDITION_DATE, DRY_RUN=1, FORCE=1
//
// This is a growth extra running alongside the newsletter, so every failure
// path logs and exits 0 rather than reddening the send job.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://zrjbzowohsgjbrhsldfi.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const TF_KEY = process.env.TYPEFULLY_API_KEY;
const TF_SET = process.env.TYPEFULLY_SOCIAL_SET_ID || "";
const MODE = (process.env.NOTES_MODE || "draft").toLowerCase();
const SITE_URL = (process.env.SITE_URL || "https://www.wortins.com").replace(/\/$/, "");
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const FORCE = process.env.FORCE === "1" || process.env.FORCE === "true";

const TF = "https://api.typefully.com";
const ALSO_COUNT = 3;
// Posts per platform per day. Typefully's queue spaces them: each draft is
// created with publish_at "next-free-slot", so three drafts land on the three
// configured slots (11:00 / 15:00 / 19:00 IST). LinkedIn takes fewer because a
// company page dilutes its own reach if it posts more than about twice a day.
// 32 posts/day total. X and Bluesky take the most (short-format feeds that
// tolerate frequency, and Bluesky is the only account with traction), Substack
// Notes and Mastodon sit in the middle. LinkedIn runs 4 in-depth news posts
// (the user's call, 2026-09-12: one image each, no carousels).
const PER_DAY = { substack: 6, x: 8, bluesky: 8, mastodon: 6, linkedin: 4 };
// The day is drafted in WAVES, not one morning batch. Each run drafts only the
// slots owed until the next wave, from whatever the curator has produced by
// then, so an evening post carries evening news. Wave sizing self-heals: a
// skipped run's share flows to the next one.
const WAVE_HOURS_UTC = [3, 7, 11]; // ~09:00 / 13:00 / 17:00 IST
const DRAFT_MODEL = process.env.DRAFT_MODEL || "";
// The pick pool spans sections: 8 distinct stories a day cannot come from the
// daily section alone (it dips to 3 on thin days). Funding and articles join
// the pool; tools stay out per editorial call.
const POOL_DAILY = 10, POOL_FUNDING = 6, POOL_ARTICLES = 4;

const warn = (m) => console.warn(`⚠ ${m}`);
const skip = (m) => { console.log(`→ ${m}`); process.exitCode = 0; };

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
  if (!res.ok) throw new Error(`Supabase ${init.method || "GET"} ${path} -> ${res.status} ${body.slice(0, 200)}`);
  return body ? JSON.parse(body) : null;
}

async function tf(path, init = {}) {
  // v2 path rule, verified against the live API: COLLECTIONS take no trailing
  // slash ("/v2/social-sets", ".../drafts") while a single RESOURCE needs one
  // ("/v2/social-sets/{id}/"). Getting it backwards returns 404 or a 301 that
  // would turn this POST into a GET.
  const res = await fetch(`${TF}${path}`, {
    redirect: "follow",
    ...init,
    headers: {
      Authorization: `Bearer ${TF_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`Typefully ${init.method || "GET"} ${path} -> ${res.status} ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : null;
}

// House style: no em/en dashes.
function deDash(s) {
  return String(s ?? "")
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")
    .replace(/\s*[–—]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}
const headlineOf = (it) => deDash(it.plain_title || it.title);
const lineOf = (it) => deDash(it.plain_line || it.summary || "");

// Draft the note in the house voice: news stated plainly, then an honest
// reaction. This is the same voice already tuned for Bluesky (news first, no
// fake-deep closers, plain language), widened for Notes, where there is room
// for a real thought instead of a 290-character compression.
function draftPrompt(items, want) {
  const list = items
    .map((it, i) => `${i + 1}. slug: ${it.slug} [section: ${it.section}]\nHEADLINE: ${deDash(it.plain_title || it.title)}\nEDITORIAL TAKE (the real, specific point, mine on this story): ${deDash(it.wortins_take || it.plain_line || it.summary || "")}`)
    .join("\n\n");

  return `You ghost-write the day's social posts for the person behind Wortins, an independent AI-news brief. You are ONE real person telling people what happened in AI today and what you honestly make of it. Not a brand, not a thought-leader. You do not perform cleverness or chase engagement.

Pick the ${want.picks} stories below most worth writing about: the most surprising or consequential, not simply the first ones listed (fewer only if the list itself is shorter). They must be GENUINELY DIFFERENT stories, and mix the kinds: news, funding, and a worthwhile read. Each story is labelled with its section.

Order them best first. The order decides where each runs, and the FIRST picks are the LinkedIn picks, so they must be the ones that pass the INTERESTING test hardest (defined in the LinkedIn rules below), from any section; the rest follow.
- EVERY pick gets "short" AND "x".${want.note > 0 ? `\n- Picks 1 to ${want.note} ALSO get "note".` : `\n- No pick gets "note" this run.`}${want.linkedin > 0 ? `\n- Picks 1 to ${want.linkedin} ALSO get "linkedin".` : `\n- No pick gets "linkedin" this run.`}
Later picks get fewer formats, so put the stories with the most substance first.

Write each required piece native to its place. Same facts and same voice every time, but genuinely different shapes, not one text reflowed. NONE of them may contain a URL; links are added separately.

HOW TO WRITE (all three):
1. Say what happened, clearly, in plain full sentences. Name the company and what they did, with the key numbers or dates, so someone who knows nothing understands it from the opening. Clarity beats brevity.
2. Point at the genuinely notable part in plain words. Then, IF you close at all, close with ONE of: a real specific observation (who this actually helps or hurts, a concrete knock-on effect), OR a simple honest reaction. Ending on the clear facts with no closer is also fine.

VOICE MODEL (news stated plainly, then a simple honest reaction):
"Bluelearn is shutting down their operations and will no longer be functional. I kind of felt this coming....."

NEVER write the fake-deep tacked-on closer. These are real rejected drafts; avoid anything like them:
- "...distinction without a difference if you're laid off..."
- "...kind of grim reminder these tools aren't fully ours to keep..."
- "...kind of the real story this week..."
They sound profound and say nothing. Test: if your last line could be pasted onto almost any story, cut it.

ALWAYS: no em dashes, no hashtags, no emoji, no engagement bait, no "thread below", no questions asked to farm replies, no sign-offs, no "The takeaway is". Plain clear language, full sentences, contractions fine. Any reaction must be specific and true to THIS story.

THE THREE PIECES:

"note" - the Substack Note. 700 to 1100 characters. **Written to be READ, not skimmed off a wall of text: SHORT PARAGRAPHS of one to three sentences, with a blank line between every paragraph.** Open on the news itself, give it room to breathe across several paragraphs, and land on the part that actually matters. This is the longest of the three and can carry the most detail.

"x" - the X (Twitter) thread: an array of 3 or 4 posts, each 280 characters or fewer, hard limit per post. This is where a reader gets the WHOLE story without leaving X, so it is the most detailed of the short formats.
- Post 1 is the lead and must stand completely on its own: the news as a full specific sentence, a blank line, then your honest reaction. Use the space, up to 280 characters; a 120-character lead wastes the slot.
- Posts 2 to 4 are the details, written under the lead as a thread, each a full 200-280 characters. In order: (2) the concrete specifics: numbers, names, dates, what exactly was said or shipped; (3) the background a reader is missing: what came before, why now, who else is involved; (4) what it changes and for whom, or the part everyone is glossing over. Full sentences, no "1/", no "thread", no "more below". Each post must add facts the earlier ones did not carry.
- Write all 4 posts unless the story genuinely cannot support a fourth angle; NEVER fewer than 3 (lead + two detail posts). A lead with a single detail post under it is a failed thread.
- Do NOT write a closing "read more" post; the link is added separately.

"short" - ONE standalone post, used on Bluesky and Mastodon. Never a thread.
- 270 characters or fewer, hard limit.
- It must stand completely on its own. Someone who reads only this has learned the news.
- Lead with the most concrete, surprising thing, stated as a full sentence.
- FORMAT IT TO BE READ ON A PHONE: put a blank line between the news and your reaction. Two short blocks read far better than one dense paragraph. Never one long run-on block.
- No "1/", no "a thread", no teasing a follow-up, no "read more".

"linkedin" - for LinkedIn. 1600 to 2600 characters. This is the piece people will actually READ, so it has to be worth reading: a genuinely interesting piece of AI news, explained properly.
- WHICH STORY: the LinkedIn picks must pass the INTERESTING test, whatever section they come from. A story is interesting when a smart friend who does not follow AI would say "wait, really?" on hearing it. That happens when at least one of these is true:
  1. a big player made a surprising move, or reversed itself (OpenAI says it may slow down; the DOJ goes after an Nvidia deal);
  2. a number stops you (a $3 billion round at a $30 billion valuation; a chipmaker up 188% on its first day). Funding rounds count exactly when the size, the valuation or who is writing the cheque tells you where the money is going;
  3. it changes what people can do next week (a launch people will actually use, from anyone, big or small);
  4. there is a fight, a leak or a mess (a settlement descending into chaos; a lab banning staff from talking);
  5. a strange real-world consequence (AI agents flooding benefit systems; a phone hinge designed by AI).
  NOT interesting, however large the company: routine partnerships, a university opening a department, a small round for a niche vertical, procedural legal steps, technical internals, plain product updates with no twist. Rank the candidates by how hard the "wait, really?" hits, and take the top ones.
- The FIRST line is the only thing most people see before "see more". Make it the single most surprising fact, as one complete specific sentence. Never a label, never a question, never "Here's what happened".
- Then a blank line, then TELL THE WHOLE STORY, in this order, in short paragraphs of one to three sentences with a blank line between each:
  (a) what exactly happened, with the concrete details that make it real: who, what they did, the numbers, the dates, the names of the products or people;
  (b) the background a smart outsider is missing: what came before this, what the company or person was doing until now, why it is happening now;
  (c) what it actually changes and for whom: users, competitors, workers, a specific industry. Be concrete, name them;
  (d) your honest read of it, in one or two plain sentences. Specific to this story, or leave it out.
- Depth means detail, not length. Every paragraph must add a new fact or a new angle. If you find yourself restating, stop.
- Write the way a knowledgeable person types a post to people they respect, not the way a brand writes a caption. No bullet lists, no headers, no bold. Do not open with the company name as a headline fragment.

TODAY'S STORIES:
${list}

Return ONLY a JSON object, no prose around it, with up to ${want.picks} entries in "picks", best first. Omit "note" and "linkedin" on picks that do not need them per the rules above:
{"picks":[{"slug":"<slug>","short":"<the one standalone post>","x":["<lead post>","<details>","<optional more details>"],"note":"<where required>","linkedin":"<where required>"}]}`;
}

function claudeNote(items, want) {
  try {
    const args = ["-p", draftPrompt(items, want), "--output-format", "text"];
    if (DRAFT_MODEL) args.splice(2, 0, "--model", DRAFT_MODEL);
    const out = execFileSync("claude", args, {
      encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 540000, env: process.env,
    });
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no JSON in claude output");
    const parsed = JSON.parse(m[0]);
    // deDash collapses ALL whitespace, which silently flattened every
    // paragraph into one block. That is why the Substack note read as a wall.
    // Everything long is cleaned with breaks preserved.
    const stripUrls = (t) => t.replace(/https?:\/\/\S+/g, "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    const clean = (t) => stripUrls(String(t || "").replace(/\s*[–—]\s*/g, ", ").replace(/[ \t]+/g, " ").trim());

    const raw = Array.isArray(parsed.picks) ? parsed.picks : [parsed];
    const picks = [];
    for (const it of raw) {
      const note = clean(it.note);
      // One standalone post. Paragraph breaks are preserved on purpose: they
      // are what makes it readable on a phone.
      let short = clean(it.short);
      if (short.length > 275) short = "";
      let linkedin = clean(it.linkedin);
      if (linkedin.length < 900 || linkedin.length > 3000) linkedin = "";
      // every pick must at least carry the short format; note under 150 chars
      // is treated as absent rather than posted half-baked
      if (!short) continue;
      // The X thread: 2-3 posts, each within X's 280 limit. Anything malformed
      // collapses to the standalone short, so X never goes empty.
      let x = Array.isArray(it.x) ? it.x.map(clean).filter(Boolean).slice(0, 4) : [];
      if (x.length < 2 || x.some((t) => t.length > 280)) x = [short];
      picks.push({ slug: String(it.slug || ""), note: note.length >= 150 ? note : "", short, x, linkedin });
    }
    if (!picks.length) throw new Error("no usable picks in claude output");
    return picks;
  } catch (e) {
    // stderr carries the real reason. e.message is "Command failed: claude -p
    // <the entire prompt>", so never log it raw: it buries CI output in the
    // prompt text.
    const raw = (e.stderr && String(e.stderr).trim()) || "";
    const detail = raw
      ? raw.slice(0, 200)
      : String(e.message).replace(/Command failed: claude[\s\S]*/, `claude exited non-zero${e.status ? ` (${e.status})` : ""}`).slice(0, 200);
    warn(`claude drafting unavailable: ${detail}`);
    warn("  Falling back to the plain headline template.");
    return null;
  }
}

// Fallback shape when Claude is unavailable: the day's biggest story in plain
// English, then a few headlines. Serviceable, but it reads like a digest promo,
// which is why the drafted version above is preferred.
function buildNote({ items, dateISO }) {
  const daily = items.filter((i) => i.section === "daily").sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  const hero = daily[0];
  if (!hero) return null;
  const also = daily.slice(1, 1 + ALSO_COUNT);
  const parts = [headlineOf(hero)];
  const line = lineOf(hero);
  if (line) parts.push("", line);
  if (also.length) {
    parts.push("", "Also in today's briefing:");
    for (const it of also) parts.push(`• ${headlineOf(it)}`);
  }
  return parts.join("\n");
}

// Attach the story's share card to a post. Typefully's media flow is three
// steps and is scoped to ONE social set, so the same image is uploaded once per
// set that needs it.
//
// The PUT is the footgun: the presigned S3 signature is computed WITHOUT
// headers, so adding any (Content-Type included) fails with 403
// SignatureDoesNotMatch. Passing a Buffer makes undici send none; a Blob,
// string or FormData would each make fetch add Content-Type and break it.
//
// Best-effort by design: if anything here fails the post still goes out, just
// without the image. A missing picture is not worth losing the post.
// Upload bytes to a social set and wait until Typefully has processed them.
// "ready" is not immediate, and attaching a still-processing media id makes
// the draft POST fail with media_not_found.
async function uploadMedia(setId, bytes, fileName, altText) {
  const created = await tf(`/v2/social-sets/${setId}/media/upload`, {
    method: "POST",
    body: JSON.stringify({ file_name: fileName, alt_text: String(altText || "").slice(0, 380) }),
  });
  if (!created?.media_id || !created?.upload_url) throw new Error("no media_id/upload_url in response");
  const put = await fetch(created.upload_url, { method: "PUT", body: bytes });
  if (!put.ok) throw new Error(`presigned PUT -> ${put.status}`);
  const deadline = Date.now() + 60000;
  for (;;) {
    const st = await tf(`/v2/social-sets/${setId}/media/${created.media_id}`);
    if (st?.status === "ready") return created.media_id;
    if (st?.status === "failed") throw new Error(`processing failed: ${st.error_reason || "unknown"}`);
    if (Date.now() > deadline) throw new Error("still processing after 60s");
    await new Promise((r) => setTimeout(r, 2000));
  }
}

const safeName = (slug) => String(slug).replace(/[^a-zA-Z0-9_.()-]/g, "-").slice(0, 60);

async function fetchCardBytes(slug) {
  const img = await fetch(`${SITE_URL}/story/${encodeURIComponent(slug)}/card.png`);
  if (!img.ok) throw new Error(`card fetch -> ${img.status}`);
  const bytes = Buffer.from(await img.arrayBuffer());
  if (!bytes.length) throw new Error("card was empty");
  return bytes;
}

async function attachCard(setId, slug, altText) {
  try {
    const bytes = await fetchCardBytes(slug);
    const id = await uploadMedia(setId, bytes, `wortins-${safeName(slug)}.png`, altText);
    console.log(`  ✓ card uploaded to set ${setId} (${Math.round(bytes.length / 1024)} KB)`);
    return id;
  } catch (e) {
    warn(`card image skipped for set ${setId}: ${e.message}`);
    return null;
  }
}

// The story's real photo: the article's own og:image, resolved by the curator
// into items.image_url (the same trick the insta-news project uses). Returns
// null on anything dubious so the caller can fall back to the clipping card:
// a missing url, a non-image, an SVG, or a tiny file (favicons and 1px
// trackers are common og:image junk).
const IMAGE_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

// Agency stock photos (a generic "hands on keyboard" Getty shot) are not
// about the story and look bad on the feed, so they get the card instead.
// Agencies watermark their filenames, which makes them cheap to spot.
const STOCK_RE = /gettyimages|shutterstock|istock|depositphotos|adobestock|dreamstime|alamy|stock-photo/i;

async function attachRealImage(setId, story, altText) {
  if (!story.image_url) return null;
  if (STOCK_RE.test(story.image_url)) {
    console.log(`  → stock photo detected for ${story.slug.slice(0, 40)}; using the card`);
    return null;
  }
  try {
    const res = await fetch(story.image_url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WortinsBot/1.0)" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`image fetch -> ${res.status}`);
    const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const ext = IMAGE_EXT[type];
    if (!ext) throw new Error(`not a usable image type (${type || "unknown"})`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length < 25000) throw new Error(`too small (${bytes.length}b), likely a logo or tracker`);
    if (bytes.length > 8 * 1024 * 1024) throw new Error(`too large (${Math.round(bytes.length / 1048576)}MB)`);
    const id = await uploadMedia(setId, bytes, `wortins-${safeName(story.slug)}.${ext}`, altText);
    console.log(`  ✓ article photo uploaded to set ${setId} (${Math.round(bytes.length / 1024)} KB ${ext})`);
    return id;
  } catch (e) {
    warn(`article photo skipped for ${story.slug.slice(0, 40)}: ${e.message}`);
    return null;
  }
}


// How many queue slots a set still has open today. Typefully's queue view
// already knows the set's timezone and which slots hold a draft, so ask it
// rather than re-deriving from the rules (whose timezone silently changed
// once). "Today" is the user's day, IST.
const IST = "Asia/Kolkata";
function istDate(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
async function freeSlotsToday(set) {
  const today = istDate();
  const q = await tf(`/v2/social-sets/${set.id}/queue?start_date=${today}&end_date=${today}`);
  const now = Date.now() + 5 * 60000;
  let free = 0;
  for (const day of q?.days || []) {
    for (const it of day.items || []) {
      if (it.kind === "queue_slot" && !it.draft && new Date(it.at).getTime() > now && istDate(new Date(it.at)) === today) free++;
    }
  }
  return free;
}

async function main() {
  if (!SUPABASE_KEY) return skip("No Supabase key; skipping.");
  if (!TF_KEY) {
    return skip("TYPEFULLY_API_KEY is not set, so there is nothing to post to. Add the secret to switch Substack Notes on.");
  }

  let dateISO = process.env.EDITION_DATE || "";
  if (!dateISO) {
    const rows = await sb("items?is_active=eq.true&edition_date=not.is.null&select=edition_date&order=edition_date.desc&limit=1");
    dateISO = rows?.[0]?.edition_date;
  }
  if (!dateISO) return skip("No edition with items found.");
  console.log(`→ Edition ${dateISO} (mode: ${MODE})`);

  // Wave accounting. How much of today's per-platform count is already
  // created, and how many waves are left to spread the remainder over. FORCE
  // ignores the ledger entirely (full fresh wave, duplicates allowed).
  const day = new Date().toISOString().slice(0, 10);
  const hourUTC = new Date().getUTCHours();
  const remainingRuns = WAVE_HOURS_UTC.filter((h) => hourUTC < h + 2).length || 1;
  let ledgerRows = [];
  if (!FORCE) {
    ledgerRows = (await sb(`social_posts_ledger?day=eq.${day}&select=platform,slug`).catch((e) => {
      warn(`ledger unreadable (${e.message}); treating today as empty`);
      return [];
    })) || [];
  }
  const createdToday = {};
  for (const r of ledgerRows) createdToday[r.platform] = (createdToday[r.platform] || 0) + 1;
  const usedSlugs = new Set(ledgerRows.map((r) => r.slug));
  const quota = {};
  for (const [plat, perDay] of Object.entries(PER_DAY)) {
    quota[plat] = Math.max(0, Math.ceil((perDay - (createdToday[plat] || 0)) / remainingRuns));
  }
  console.log(`→ wave: ${remainingRuns} run(s) left today · quotas ${JSON.stringify(quota)} · ${usedSlugs.size} slug(s) already used`);
  if (Object.values(quota).every((q) => q === 0)) return skip("Today's counts are already met; nothing owed this wave.");

  // Pick sets BY CAPABILITY, never by list order. The account now has one set
  // per channel (Substack on one, X on another), and results[0] is not
  // guaranteed to be the Substack one, so indexing would post to the wrong
  // place the moment the ordering changed.
  const sets = await tf("/v2/social-sets");
  if (!sets?.results?.length) return skip("No Typefully social sets on this account.");
  const details = [];
  for (const r of sets.results) {
    try { details.push(await tf(`/v2/social-sets/${r.id}/`)); }
    catch (e) { warn(`could not read social set ${r.id}: ${e.message}`); }
  }
  const substackSet = TF_SET
    ? details.find((d) => String(d.id) === String(TF_SET))
    : details.find((d) => d?.platforms?.substack);
  const xSet = details.find((d) => d?.platforms?.x);
  const linkedinSet = details.find((d) => d?.platforms?.linkedin);
  const blueskySet = details.find((d) => d?.platforms?.bluesky);
  const mastodonSet = details.find((d) => d?.platforms?.mastodon);

  if (!substackSet) {
    return skip(
      "Substack is not connected to any Typefully social set. " +
      "Connect it in Typefully > Settings > Integrations, then this starts posting on its own."
    );
  }
  console.log(`→ Substack: set ${substackSet.id}, @${substackSet.platforms.substack.username || "?"}`);
  if (xSet) console.log(`→ X: set ${xSet.id}, @${xSet.platforms.x.username || "?"}`);
  if (linkedinSet) console.log(`→ LinkedIn: set ${linkedinSet.id}, @${linkedinSet.platforms.linkedin.username || "?"}`);
  if (blueskySet) console.log(`→ Bluesky: set ${blueskySet.id}, @${blueskySet.platforms.bluesky.username || "?"}`);
  if (mastodonSet) console.log(`→ Mastodon: set ${mastodonSet.id}, @${mastodonSet.platforms.mastodon.username || "?"}`);
  const pubQuota = substackSet.publishing_quota;
  if (pubQuota) console.log(`→ publishing quota: ${pubQuota.remaining} left, resets ${pubQuota.resets_at}`);
  if (MODE !== "draft" && pubQuota && pubQuota.remaining <= 0) {
    return skip(`Publishing quota is exhausted (resets ${pubQuota.resets_at}); not publishing.`);
  }

  // NEVER SPILL INTO TOMORROW. "next-free-slot" happily books tomorrow
  // morning once today's slots are full, which is how 10 drafts with today's
  // news ended up on tomorrow's 09:30-12:30 (2026-09-12). Each platform's
  // quota is capped at the queue slots still open today; what does not fit
  // is simply not drafted, and tomorrow's waves write tomorrow's posts.
  if (MODE === "queue" && !DRY_RUN) {
    for (const [plat, set] of [["substack", substackSet], ["x", xSet], ["bluesky", blueskySet], ["mastodon", mastodonSet], ["linkedin", linkedinSet]]) {
      if (!set || !quota[plat]) continue;
      const free = await freeSlotsToday(set).catch((e) => { warn(`slot count failed for ${plat}: ${e.message}`); return null; });
      if (free === null) continue;
      if (free < quota[plat]) console.log(`  ${plat}: only ${free} slot(s) left today; capping ${quota[plat]} -> ${free}`);
      quota[plat] = Math.min(quota[plat], free);
    }
    if (Object.values(quota).every((q) => q === 0)) return skip("No queue slots left today on any platform; nothing drafted (no spill into tomorrow).");
  }

  const items = await sb(
    `items?is_active=eq.true&edition_date=eq.${dateISO}&select=section,slug,title,summary,rank,plain_title,plain_line,image_url`
  );
  if (!items?.length) return skip(`No active items for ${dateISO}.`);

  const bySection = (sec, n) => items
    .filter((i) => i.section === sec && !usedSlugs.has(i.slug))
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    .slice(0, n);
  const daily = bySection("daily", POOL_DAILY);
  const pool = [...daily, ...bySection("funding", POOL_FUNDING), ...bySection("articles", POOL_ARTICLES)];
  if (!pool.length) return skip("No stories to build a note from.");

  // The link is appended here, never by the model: Typefully attaches the
  // preview card to the LAST url, so it has to stand alone at the end.
  const want = { picks: Math.max(...Object.values(quota)), note: quota.substack, linkedin: quota.linkedin };
  let picks = claudeNote(pool, want);
  if (!picks?.length) {
    // Fallback: one template note, so a Claude outage still posts something.
    const body = buildNote({ items, dateISO });
    if (!body) return skip("No daily story to build a note from.");
    picks = [{ slug: pool[0].slug, note: body, short: "", x: [], linkedin: "" }];
  }
  console.log(`→ ${picks.length} story pick(s) drafted`);

  // Omitting publish_at is what makes a draft. Only add it when the operator
  // has explicitly asked for real publishing. "next-free-slot" is what spaces
  // the day's posts: each draft takes the next configured queue slot, so three
  // drafts land on 11:00 / 15:00 / 19:00 IST without us hardcoding any times.
  const timing = MODE === "queue" ? { publish_at: "next-free-slot" }
               : MODE === "now"   ? { publish_at: "now" }
               : {};

  // Tagging is LinkedIn-only. On X a handle cannot be verified through any API
  // we have, and X's automation rules prohibit bulk automated mentions.

  const jobs = [];
  picks.forEach((pk, i) => {
    const story = pool.find((d) => d.slug === pk.slug) || pool[i] || pool[0];
    const n = i + 1;

    if (i < quota.substack && pk.note) {
      jobs.push({
        set: substackSet, label: `Substack ${n}`, platform: "substack", story,
        payload: { draft_title: `Wortins ${dateISO} · Substack ${n}`, ...timing,
          platforms: { substack: { enabled: true, posts: [{ text: pk.note }] } } },
      });
    }

    // X gets the lead post with the details threaded under it (the user's
    // call, 2026-09-12: "make it longer, then under the same thread write more
    // details"). Bluesky and Mastodon get the one standalone short. No links,
    // no mentions anywhere: the image is the payload and it has wortins.com
    // on it.
    for (const [plat, set] of [["x", xSet], ["bluesky", blueskySet], ["mastodon", mastodonSet]]) {
      if (!set || i >= quota[plat] || !pk.short) continue;
      const cap = plat === "x" ? "X" : plat[0].toUpperCase() + plat.slice(1);
      // The X thread ends on the Wortins story page (the user's call,
      // 2026-09-12: "in the thread, link them to the article on Wortins").
      // Last post only, so the lead is never a link post.
      const texts = plat === "x" && pk.x?.length > 1
        ? [...pk.x, `Full story and our take, on Wortins:\n${SITE_URL}/story/${encodeURIComponent(story.slug)}`]
        : [pk.short];
      jobs.push({
        set, label: `${cap} ${n}`, platform: plat, story,
        payload: { draft_title: `Wortins ${dateISO} · ${cap} ${n}`, ...timing,
          platforms: { [plat]: { enabled: true, posts: texts.map((text) => ({ text })) } } },
      });
    }

    if (linkedinSet && i < quota.linkedin && pk.linkedin) {
      jobs.push({
        set: linkedinSet, label: `LinkedIn ${n}`, platform: "linkedin", story,
        payload: { draft_title: `Wortins ${dateISO} · LinkedIn ${n}`, ...timing,
          platforms: { linkedin: { enabled: true, posts: [{ text: pk.linkedin }] } } },
      });
    }
  });

  for (const j of jobs) console.log(`  → ${j.label}: ${headlineOf(j.story)}`);

  // Every post carries exactly one image and none carry a link. The image
  // alternates per story: the hero and every second pick keep the branded
  // clipping card, the others use the article's own photo (items.image_url,
  // the publisher's og:image), falling back to the card when the photo is
  // missing or junk. Roughly half and half across the day, and a story uses
  // the same image on every platform it appears on, LinkedIn included. Media
  // is scoped to one social set, so each chosen image uploads once per set.
  const pickIndex = new Map(picks.map((pk, i) => [pk.slug, i]));
  if (!DRY_RUN) {
    const cache = new Map(); // set:slug -> { lead, other } media ids
    for (const j of jobs) {
      const key = `${j.set.id}:${j.story.slug}`;
      let media = cache.get(key);
      if (media === undefined) {
        const alt = `${headlineOf(j.story)}. ${lineOf(j.story)}`;
        const wantsPhoto = (pickIndex.get(j.story.slug) ?? 0) % 2 === 1;
        const photo = j.story.image_url ? await attachRealImage(j.set.id, j.story, alt) : null;
        const card = (!wantsPhoto || !photo) ? await attachCard(j.set.id, j.story.slug, alt) : null;
        // lead = whichever the alternation asked for; the other image, when
        // it exists, goes on the details post so a thread is not one image
        // repeated (user: "occasionally use different images").
        const lead = wantsPhoto ? (photo || card) : (card || photo);
        const other = lead === photo ? card : photo;
        media = { lead, other };
        cache.set(key, media);
      }
      const posts = j.payload.platforms[j.platform].posts;
      if (media.lead) posts[0].media_ids = [media.lead];
      if (media.other && j.platform === "x" && posts.length > 2) posts[1].media_ids = [media.other];
    }
  }

  if (DRY_RUN) {
    for (const j of jobs) {
      console.log(`[DRY RUN] would POST /v2/social-sets/${j.set.id}/drafts (${j.label})`);
      console.log(JSON.stringify(j.payload, null, 2).slice(0, 700));
    }
    return;
  }

  for (const j of jobs) {
    // One channel failing must not take the other down with it.
    try {
      const draft = await tf(`/v2/social-sets/${j.set.id}/drafts`, { method: "POST", body: JSON.stringify(j.payload) });
      const did = draft?.id ?? draft?.draft?.id ?? null;
      const durl = draft?.share_url || (did ? `https://typefully.com/?d=${did}` : null);
      console.log(`✓ ${j.label}: ${MODE === "draft" ? "draft created" : "scheduled"}${did ? ` (id ${did})` : ""}${durl ? ` ${durl}` : ""}`);
      // The ledger is what caps later waves and dedups their picks, so it must
      // record even when a later insert fails: each row is best-effort alone.
      await sb("social_posts_ledger", {
        method: "POST",
        body: JSON.stringify({ day, platform: j.platform, slug: j.story.slug, draft_id: did ? String(did) : null }),
      }).catch((e) => warn(`ledger write failed for ${j.label}: ${e.message}`));
    } catch (e) {
      warn(`${j.label} failed: ${e.message}`);
    }
  }
  if (MODE === "draft") console.log("  Open Typefully and hit publish.");

}

export { buildNote, draftPrompt, deDash, attachCard };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    warn(`substack-note failed (${e?.message || e}). The newsletter is unaffected.`);
    process.exitCode = 0;
  });
}
