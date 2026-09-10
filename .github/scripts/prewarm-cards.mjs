#!/usr/bin/env node
// Warms the edge cache for today's story cards.
//
// A card is a 1080x1350 PNG rendered on demand, and rendering one costs about
// three seconds. /today shows a card per story, so without warming, the first
// person to ask for each image pays that wait. The wave already fetches a card
// for every story it posts (which warms those), but /today lists more stories
// than any single wave posts, so the rest stayed cold. This fetches all of
// them right after the wave, while nobody is waiting.
//
// Purely an optimisation: every failure is logged and ignored, and the process
// always exits 0. A cold cache costs a slow first tap, never a broken page.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY), SITE_URL,
//      EDITION_DATE (optional), CONCURRENCY (default 3)

const SUPABASE_URL = process.env.SUPABASE_URL || "https://zrjbzowohsgjbrhsldfi.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const SITE_URL = (process.env.SITE_URL || "https://www.wortins.com").replace(/\/$/, "");
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY) || 3);

// Mirrors what /today lists, so every card that page can show gets warmed.
const PER = { daily: 5, funding: 3, articles: 3 };

async function sb(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}

async function main() {
  if (!KEY) { console.log("→ No Supabase key; nothing to warm."); return; }

  let date = process.env.EDITION_DATE || "";
  if (!date) {
    const rows = await sb("items?is_active=eq.true&edition_date=not.is.null&select=edition_date&order=edition_date.desc&limit=1");
    date = rows?.[0]?.edition_date;
  }
  if (!date) { console.log("→ No edition found."); return; }

  const items = await sb(`items?is_active=eq.true&edition_date=eq.${date}&select=section,slug,rank`);
  const pick = (sec) => (items || [])
    .filter((i) => i.section === sec)
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    .slice(0, PER[sec] || 0);
  const slugs = [...pick("daily"), ...pick("funding"), ...pick("articles")].map((i) => i.slug);
  if (!slugs.length) { console.log(`→ No stories for ${date}.`); return; }

  console.log(`→ Warming ${slugs.length} card(s) for ${date}`);
  let ok = 0, failed = 0;
  const queue = [...slugs];

  // A few at a time: each miss costs the renderer ~3s of CPU, and hammering it
  // in parallel would just make them all slow.
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (;;) {
        const slug = queue.shift();
        if (!slug) return;
        const t0 = Date.now();
        try {
          const res = await fetch(`${SITE_URL}/story/${encodeURIComponent(slug)}/card.png`);
          const ms = Date.now() - t0;
          if (res.ok) { ok++; console.log(`  ✓ ${slug.slice(0, 44)} (${ms}ms)`); }
          else { failed++; console.warn(`  ⚠ ${slug.slice(0, 44)} -> HTTP ${res.status}`); }
          await res.arrayBuffer().catch(() => {}); // drain so the edge stores it
        } catch (e) {
          failed++;
          console.warn(`  ⚠ ${slug.slice(0, 44)} -> ${e.message}`);
        }
      }
    })
  );
  console.log(`✓ Warmed ${ok}/${slugs.length}${failed ? `, ${failed} failed` : ""}.`);
}

main().catch((e) => {
  console.warn(`⚠ prewarm failed (${e.message}). Cards will render on first request.`);
  process.exitCode = 0;
});
