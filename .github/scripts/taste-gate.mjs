#!/usr/bin/env node
// Mechanical taste gate. Runs after every curator write pass (and standalone).
// The taste rules have lived in the curator prompts for months and drift keeps
// happening anyway — an LLM under context pressure re-admits the banned infra
// beat and stacks the same outlet. So the two rules readers actually notice
// are enforced HERE, deterministically, where they cannot drift:
//
//   1. BANNED BEAT (daily + articles): datacenter/compute build-outs, capex
//      figures, AI chips / inference silicon / foundry / HBM / memory,
//      chip supply chain. Title or summary match -> deactivated.
//   2. OUTLET CAPS (daily): an outlet keeps at most MAX_PER_EDITION active
//      items per edition_date, and at most MAX_PER_WINDOW active items across
//      the rolling WINDOW_HOURS the feed actually shows. Newest survive.
//      (The prompt's per-drop cap compounded: 2/drop x 3 drops/day x days
//      = the "everything is TechCrunch/Axios" feed the owner keeps seeing.)
//
// No LLM, reversible (is_active=false only, never deletes).
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (required).

const SUPABASE_URL = process.env.SUPABASE_URL || "https://zrjbzowohsgjbrhsldfi.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_KEY;

const WINDOW_HOURS = 96;
const MAX_PER_EDITION = 2;
const MAX_PER_WINDOW = 4;

// Curated to the beat the owner rejects; deliberately specific to avoid
// nuking legitimate stories that merely mention a chip.
const BANNED = new RegExp(
  [
    "gigawatt",
    "megawatt",
    "capex",
    "data ?cent(er|re)s? (build|expansion|deployment|capacity)",
    "(inference|custom|in-house) (ai )?(chip|silicon|accelerator)",
    "accelerator deployment",
    "gpu (cluster|deployment|capacity)",
    "foundry",
    "hbm[0-9]?",
    "memory chip",
    "wafer",
    "chip (fab|plant|supply)",
    "supply chain.*(chip|semiconductor)",
    "(chip|semiconductor).*supply chain",
  ].join("|"),
  "i"
);

function die(m) {
  console.error("✗ " + m);
  process.exit(1);
}
if (!KEY) die("SUPABASE_SERVICE_KEY is required");

async function sb(path, init) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${path} -> ${res.status} ${(await res.text()).slice(0, 180)}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

async function deactivate(ids, why) {
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    await sb(`items?id=in.(${chunk.join(",")})`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ is_active: false }),
    });
  }
  for (const id of ids) console.log(`  gated (${why}) ${id}`);
}

async function main() {
  const since = new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString();
  const items = await sb(
    `items?is_active=eq.true&section=in.(daily,articles)&published_at=gte.${since}` +
      `&select=id,section,source,title,summary,edition_date,published_at&order=published_at.desc&limit=900`
  );
  if (!items?.length) {
    console.log("taste-gate: nothing in window");
    return;
  }

  // 1. Banned beat.
  const banned = items.filter(
    (it) => BANNED.test(it.title ?? "") || BANNED.test(it.summary ?? "")
  );
  if (banned.length) {
    await deactivate(
      banned.map((b) => b.id),
      "banned-beat"
    );
    banned.forEach((b) => console.log(`    beat: ${String(b.title).slice(0, 70)}`));
  }

  // 2. Outlet caps (daily only; newest kept). Items already gated above are out.
  const gatedIds = new Set(banned.map((b) => b.id));
  const daily = items.filter((it) => it.section === "daily" && !gatedIds.has(it.id));
  const overCap = [];
  const perEdition = new Map(); // `${source}|${edition_date}` -> count
  const perWindow = new Map(); // source -> count
  for (const it of daily) {
    // ordered newest-first, so the newest always claim the slots
    const src = (it.source || "unknown").toLowerCase();
    const eKey = `${src}|${it.edition_date}`;
    const e = (perEdition.get(eKey) || 0) + 1;
    const w = (perWindow.get(src) || 0) + 1;
    perEdition.set(eKey, e);
    perWindow.set(src, w);
    if (e > MAX_PER_EDITION || w > MAX_PER_WINDOW) {
      overCap.push(it);
    }
  }
  if (overCap.length) {
    await deactivate(
      overCap.map((o) => o.id),
      "outlet-cap"
    );
    overCap.forEach((o) => console.log(`    cap: [${o.source}] ${String(o.title).slice(0, 60)}`));
  }

  console.log(
    `taste-gate done: checked=${items.length} banned-beat=${banned.length} outlet-cap=${overCap.length}`
  );
}

main().catch((e) => die(e.message));
