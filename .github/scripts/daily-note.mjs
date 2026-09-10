#!/usr/bin/env node
// Turns the day's edition into a Substack Note, via Typefully.
//
// Substack has no official write API and its internal one sits behind
// Cloudflare, which challenges datacenter IPs (i.e. GitHub Actions). Typefully
// is an official Substack integration, so it is the one path that lets CI touch
// Substack at all. It publishes Substack *Notes* only (the API caps the
// platform at a single note), which is exactly the half worth automating: notes
// are the discovery surface and are posted many times a week, while the long
// newsletter post stays a 30-second paste from /compose.
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
const DRAFT_MODEL = process.env.DRAFT_MODEL || "";
const POOL = 6; // top daily stories Claude picks the note from

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
function draftPrompt(items) {
  const list = items
    .map((it, i) => `${i + 1}. slug: ${it.slug}\nHEADLINE: ${deDash(it.plain_title || it.title)}\nEDITORIAL TAKE (the real, specific point, mine on this story): ${deDash(it.wortins_take || it.plain_line || it.summary || "")}`)
    .join("\n\n");

  return `You ghost-write the day's social posts for the person behind Wortins, an independent AI-news brief. You are ONE real person telling people what happened in AI today and what you honestly make of it. Not a brand, not a thought-leader. You do not perform cleverness or chase engagement.

Pick the ONE story below that is most worth writing about: the most surprising or consequential, not simply the first.

Write it THREE times, native to each place. Same facts and same voice every time, but genuinely different shapes, not one text reflowed. NONE of them may contain a URL; links are added separately.

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

"x_thread" - an ARRAY of 2 or 3 posts for X, in order, which will publish as a thread.
- Each post 270 characters or fewer, hard limit.
- Post 1 must stand completely on its own: the most concrete, surprising thing, stated as a full thought. Someone who reads only post 1 should have learned the news.
- Posts 2 and 3 add the detail and then the observation. Do not write "1/", "2/", or "a thread".
- Do not tease the later posts from post 1.

"linkedin" - for LinkedIn. 900 to 1500 characters. Longer and more considered than the others.
- The FIRST line is the only thing most people see before "see more". Make it a complete, specific, interesting sentence. Never a label, never a question, never "Here's what happened".
- Then a blank line, then the argument in SHORT paragraphs of one to two sentences each, blank line between them. No paragraph longer than two sentences.
- Write the way a person types a post, not the way a brand writes a caption. No bullet lists. Do not open with the company name as a headline fragment.

TODAY'S STORIES:
${list}

Return ONLY a JSON object, no prose around it:
{"slug":"<the slug you chose>","note":"<Substack note, short paragraphs>","x_thread":["<post 1>","<post 2>"],"linkedin":"<LinkedIn post, short paragraphs>"}`;
}

function claudeNote(items) {
  try {
    const args = ["-p", draftPrompt(items), "--output-format", "text"];
    if (DRAFT_MODEL) args.splice(2, 0, "--model", DRAFT_MODEL);
    const out = execFileSync("claude", args, {
      encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 180000, env: process.env,
    });
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no JSON in claude output");
    const parsed = JSON.parse(m[0]);
    // deDash collapses ALL whitespace, which silently flattened every
    // paragraph into one block. That is why the Substack note read as a wall.
    // Everything long is cleaned with breaks preserved.
    const stripUrls = (t) => t.replace(/https?:\/\/\S+/g, "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    const clean = (t) => stripUrls(String(t || "").replace(/\s*[–—]\s*/g, ", ").replace(/[ \t]+/g, " ").trim());

    const note = clean(parsed.note);
    if (note.length < 150) throw new Error(`note too short (${note.length} chars)`);

    // X publishes as a thread; the link becomes the reply, added later.
    let xThread = Array.isArray(parsed.x_thread) ? parsed.x_thread : [];
    xThread = xThread.map((t) => clean(t).replace(/\n+/g, " ")).filter(Boolean).filter((t) => t.length <= 275).slice(0, 3);
    if (xThread.length < 1) xThread = [];

    let linkedin = clean(parsed.linkedin);
    if (linkedin.length < 300 || linkedin.length > 2200) linkedin = "";

    return { slug: String(parsed.slug || ""), note, xThread, linkedin };
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
async function attachCard(setId, slug, altText) {
  try {
    const safe = `wortins-${String(slug).replace(/[^a-zA-Z0-9_.()-]/g, "-").slice(0, 60)}.png`;
    const created = await tf(`/v2/social-sets/${setId}/media/upload`, {
      method: "POST",
      body: JSON.stringify({ file_name: safe, alt_text: String(altText || "").slice(0, 380) }),
    });
    if (!created?.media_id || !created?.upload_url) throw new Error("no media_id/upload_url in response");

    const img = await fetch(`${SITE_URL}/story/${encodeURIComponent(slug)}/card.png`);
    if (!img.ok) throw new Error(`card fetch -> ${img.status}`);
    const bytes = Buffer.from(await img.arrayBuffer());
    if (!bytes.length) throw new Error("card was empty");

    const put = await fetch(created.upload_url, { method: "PUT", body: bytes });
    if (!put.ok) throw new Error(`presigned PUT -> ${put.status}`);

    // "ready" is not immediate, and attaching a still-processing media id makes
    // the draft POST fail with media_not_found.
    const deadline = Date.now() + 60000;
    for (;;) {
      const st = await tf(`/v2/social-sets/${setId}/media/${created.media_id}`);
      if (st?.status === "ready") {
        console.log(`  ✓ card uploaded to set ${setId} (${Math.round(bytes.length / 1024)} KB)`);
        return created.media_id;
      }
      if (st?.status === "failed") throw new Error(`processing failed: ${st.error_reason || "unknown"}`);
      if (Date.now() > deadline) throw new Error("still processing after 60s");
      await new Promise((r) => setTimeout(r, 2000));
    }
  } catch (e) {
    warn(`card image skipped for set ${setId}: ${e.message}`);
    return null;
  }
}

// Splice verified LinkedIn company mentions into the post text.
//
// LinkedIn needs "@[Exact Page Name](urn:li:organization:123)"; a plain "@Name"
// is literal text, and if the display name does not match the page name
// exactly and case-sensitively it silently degrades to plain text with no
// error (LinkedIn returns 201 either way). So li_mention_text is spliced
// VERBATIM from the allowlist, never rebuilt from a name in our own data.
// That is also why the visible word can change: the page for "Nvidia" is
// actually called "NVIDIA".
//
// Only exact, word-boundary matches against the allowlist are tagged. Nothing
// is ever inferred: a company we have not verified simply goes untagged.
function addLinkedInMentions(text, entities, max = 3) {
  if (!text || !entities?.length) return { text, tagged: [] };
  const cands = [];
  for (const e of entities) {
    if (!e.li_mention_text) continue;
    const names = [e.canonical_name, ...(Array.isArray(e.aliases) ? e.aliases : [])].filter(Boolean);
    for (const n of names) cands.push({ name: n, mention: e.li_mention_text, canonical: e.canonical_name });
  }
  // Longest first, so "Scale AI" wins over "Scale".
  cands.sort((a, b) => b.name.length - a.name.length);

  let out = text;
  const used = new Set();
  const tagged = [];
  for (const c of cands) {
    if (tagged.length >= max) break;          // more than a few reads as spam
    if (used.has(c.canonical)) continue;      // one tag per company
    const esc = c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^\\w@\\[])(${esc})(?![\\w\\]])`, "i");
    // Never rewrite inside a mention we already inserted.
    const segs = out.split(/(@\[[^\]]*\]\(urn:li:[^)]*\))/);
    let done = false;
    for (let i = 0; i < segs.length && !done; i += 2) {
      if (re.test(segs[i])) {
        segs[i] = segs[i].replace(re, (_m, pre) => `${pre}${c.mention}`);
        done = true;
      }
    }
    if (done) { out = segs.join(""); used.add(c.canonical); tagged.push(c.canonical); }
  }
  return { text: out, tagged };
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

  if (!FORCE && !DRY_RUN) {
    const already = await sb(`substack_notes?edition_date=eq.${dateISO}&select=edition_date,posted_at`).catch(() => null);
    if (already?.length) return skip(`Already noted ${dateISO} at ${already[0].posted_at}. Skipping (FORCE=1 to redo).`);
  }

  const items = await sb(
    `items?is_active=eq.true&edition_date=eq.${dateISO}&select=section,slug,title,summary,rank,plain_title,plain_line`
  );
  if (!items?.length) return skip(`No active items for ${dateISO}.`);

  const daily = items
    .filter((i) => i.section === "daily")
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    .slice(0, POOL);
  if (!daily.length) return skip("No daily story to build a note from.");

  // The link is appended here, never by the model: Typefully attaches the
  // preview card to the LAST url, so it has to stand alone at the end.
  const drafted = claudeNote(daily);
  const body = (drafted && drafted.note) || buildNote({ items, dateISO });
  if (!body) return skip("No daily story to build a note from.");
  const editionUrl = `${SITE_URL}/edition/${dateISO}`;
  const text = `${body}\n\nToday's full AI briefing: ${editionUrl}`;
  console.log(`\n--- note ---\n${text}\n------------\n`);

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

  if (!substackSet) {
    return skip(
      "Substack is not connected to any Typefully social set. " +
      "Connect it in Typefully > Settings > Integrations, then this starts posting on its own."
    );
  }
  console.log(`→ Substack: set ${substackSet.id}, @${substackSet.platforms.substack.username || "?"}`);
  if (xSet) console.log(`→ X: set ${xSet.id}, @${xSet.platforms.x.username || "?"}`);
  if (linkedinSet) console.log(`→ LinkedIn: set ${linkedinSet.id}, @${linkedinSet.platforms.linkedin.username || "?"}`);
  const quota = substackSet.publishing_quota;
  if (quota) console.log(`→ publishing quota: ${quota.remaining} left, resets ${quota.resets_at}`);
  if (MODE !== "draft" && quota && quota.remaining <= 0) {
    return skip(`Publishing quota is exhausted (resets ${quota.resets_at}); not publishing.`);
  }

  // Omitting publish_at is what makes a draft. Only add it when the operator
  // has explicitly asked for real publishing.
  const timing = MODE === "queue" ? { publish_at: "next-free-slot" }
               : MODE === "now"   ? { publish_at: "now" }
               : {};

  const jobs = [
    { set: substackSet, label: "Substack Note",
      payload: { draft_title: `Wortins Daily ${dateISO}`, ...timing,
                 platforms: { substack: { enabled: true, posts: [{ text }] } } } },
  ];
  // X only when a tweet was drafted: the 400-700 char note would not fit, and a
  // truncated one reads worse than no post at all.
  if (xSet && drafted?.xThread?.length) {
    // X allows a thread (posts maxItems 50), so the link goes in a FINAL post,
    // i.e. the first reply, keeping the main post link-free. Verified against
    // the live API: a 2-post X draft is accepted (201).
    const xPosts = [...drafted.xThread.map((t) => ({ text: t })), { text: `Today's full AI briefing: ${editionUrl}` }];
    jobs.push({ set: xSet, label: "X post",
      payload: { draft_title: `Wortins Daily ${dateISO} (X)`, ...timing,
                 platforms: { x: { enabled: true, posts: xPosts } } } });
    console.log(`\n--- X (${drafted.xThread.length} posts + link reply) ---`);
    drafted.xThread.forEach((t, i) => console.log(`  [${i + 1}] ${t}`));
    console.log(`  [reply] Today's full AI briefing: ${editionUrl}\n`);
  } else if (xSet) {
    console.log("→ X connected but no thread was drafted; skipping the X draft.");
  }
  // LinkedIn gets its OWN draft, not the note reused. Its first line is all
  // most people see before "see more", and it needs real paragraph breaks, so
  // reusing prose written for Substack read like a repost. Link-free by
  // design: the card image carries the brand instead.
  if (linkedinSet && drafted?.linkedin) {
    // No link and no link-comment here. LinkedIn is capped at ONE post per
    // draft (verified: a 2-post LinkedIn draft is rejected 400
    // "LinkedIn only supports single posts"), so Typefully cannot post a first
    // comment. The card image carries the brand; the link is added by hand.
    //
    // Tagging is LinkedIn-only. On X a handle cannot be verified through any
    // API we have, and X's automation rules prohibit bulk automated mentions,
    // so a wrong guess would tag a real stranger under our brand, daily.
    const entities = await sb("social_entities?select=canonical_name,aliases,li_mention_text&li_mention_text=not.is.null")
      .catch((e) => { warn(`allowlist unavailable, posting untagged: ${e.message}`); return []; });
    const { text: liText, tagged } = addLinkedInMentions(drafted.linkedin, entities || []);
    if (tagged.length) console.log(`→ LinkedIn mentions: ${tagged.join(", ")}`);
    jobs.push({ set: linkedinSet, label: "LinkedIn post",
      payload: { draft_title: `Wortins Daily ${dateISO} (LinkedIn)`, ...timing,
                 platforms: { linkedin: { enabled: true, posts: [{ text: liText }] } } } });
    console.log(`\n--- LinkedIn ---\n${liText}\n----------------\n`);
  } else if (linkedinSet) {
    console.log("→ LinkedIn connected but no LinkedIn version was drafted; skipping.");
  }

  // Which story's card? Whichever one Claude wrote about, else the hero.
  const chosen = daily.find((it) => it.slug === drafted?.slug) || daily[0];
  const altText = `${headlineOf(chosen)}. ${lineOf(chosen)}`;

  // X and LinkedIn carry the card INSTEAD of a link. Substack keeps its link,
  // which already renders its own preview, so it gets no image.
  if (!DRY_RUN) {
    for (const j of jobs) {
      if (j.label.startsWith("Substack")) continue;
      const mediaId = await attachCard(j.set.id, chosen.slug, altText);
      if (mediaId) {
        const platform = j.label.startsWith("X") ? "x" : "linkedin";
        j.payload.platforms[platform].posts[0].media_ids = [mediaId];
      }
    }
  } else {
    console.log(`[DRY RUN] would attach ${SITE_URL}/story/${chosen.slug}/card.png to X + LinkedIn`);
  }

  if (DRY_RUN) {
    for (const j of jobs) {
      console.log(`[DRY RUN] would POST /v2/social-sets/${j.set.id}/drafts (${j.label})`);
      console.log(JSON.stringify(j.payload, null, 2).slice(0, 700));
    }
    return;
  }

  let id = null, url = null;
  for (const j of jobs) {
    // One channel failing must not take the other down with it.
    try {
      const draft = await tf(`/v2/social-sets/${j.set.id}/drafts`, { method: "POST", body: JSON.stringify(j.payload) });
      const did = draft?.id ?? draft?.draft?.id ?? null;
      const durl = draft?.share_url || (did ? `https://typefully.com/?d=${did}` : null);
      console.log(`✓ ${j.label}: ${MODE === "draft" ? "draft created" : "scheduled"}${did ? ` (id ${did})` : ""}${durl ? ` ${durl}` : ""}`);
      if (j.label.startsWith("Substack")) { id = did; url = durl; }
    } catch (e) {
      warn(`${j.label} failed: ${e.message}`);
    }
  }
  if (MODE === "draft") console.log("  Open Typefully and hit publish.");

  await sb("substack_notes", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      edition_date: dateISO,
      posted_at: new Date().toISOString(),
      note_id: id ? String(id) : null,
      note_url: url,
    }),
  }).catch((e) => warn(`ledger write failed: ${e.message}`));
}

export { buildNote, draftPrompt, deDash, attachCard, addLinkedInMentions };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    warn(`substack-note failed (${e?.message || e}). The newsletter is unaffected.`);
    process.exitCode = 0;
  });
}
