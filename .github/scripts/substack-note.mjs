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

// A note is a hook, not a digest: the day's biggest story in plain English,
// then a few headlines, then the link (Typefully attaches a preview card to the
// last URL, so it goes last and stands alone).
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
  parts.push("", `${SITE_URL}/edition/${dateISO}`);
  return parts.join("\n");
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

  const text = buildNote({ items, dateISO });
  if (!text) return skip("No daily story to build a note from.");
  console.log(`\n--- note ---\n${text}\n------------\n`);

  // Which social set, and is Substack actually connected to it? Typefully
  // rejects a substack-targeted draft otherwise, so check first and say the
  // useful thing instead of surfacing a raw 400.
  let setId = TF_SET;
  let sets = null;
  if (!setId) {
    sets = await tf("/v2/social-sets");
    if (!sets?.results?.length) return skip("No Typefully social sets on this account.");
    if (sets.results.length > 1) {
      console.log(`→ ${sets.results.length} social sets; using the first. Pin one with TYPEFULLY_SOCIAL_SET_ID.`);
    }
    setId = sets.results[0].id;
  }
  const detail = await tf(`/v2/social-sets/${setId}/`);
  if (!detail?.platforms?.substack) {
    return skip(
      `Substack is not connected to Typefully social set ${setId} (platforms.substack is null). ` +
      `Connect it in Typefully > Settings > Integrations, then this starts posting on its own.`
    );
  }
  console.log(`→ Typefully set ${setId}, Substack connected as @${detail.platforms.substack.username || "?"}`);
  const quota = detail.publishing_quota;
  if (quota) console.log(`→ publishing quota: ${quota.remaining} left, resets ${quota.resets_at}`);

  const payload = {
    draft_title: `Wortins Daily ${dateISO}`,
    platforms: { substack: { enabled: true, posts: [{ text }] } },
  };
  // Omitting publish_at is what makes this a draft. Only add it when the
  // operator has explicitly asked for real publishing.
  if (MODE === "queue") payload.publish_at = "next-free-slot";
  else if (MODE === "now") payload.publish_at = "now";

  if (MODE !== "draft" && quota && quota.remaining <= 0) {
    return skip(`Publishing quota is exhausted (resets ${quota.resets_at}); not publishing. Saving nothing.`);
  }

  if (DRY_RUN) {
    console.log(`[DRY RUN] would POST /v2/social-sets/${setId}/drafts`);
    console.log(JSON.stringify(payload, null, 2).slice(0, 900));
    return;
  }

  const draft = await tf(`/v2/social-sets/${setId}/drafts`, { method: "POST", body: JSON.stringify(payload) });
  const id = draft?.id ?? draft?.draft?.id ?? null;
  const url = draft?.share_url || (id ? `https://typefully.com/?d=${id}` : null);
  console.log(`✓ ${MODE === "draft" ? "Draft created" : "Scheduled"} in Typefully${id ? ` (id ${id})` : ""}${url ? ` ${url}` : ""}`);
  if (MODE === "draft") console.log("  Open Typefully and hit publish; it goes out as a Substack Note.");

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

export { buildNote, deDash };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    warn(`substack-note failed (${e?.message || e}). The newsletter is unaffected.`);
    process.exitCode = 0;
  });
}
