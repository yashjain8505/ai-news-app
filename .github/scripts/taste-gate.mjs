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
//   3. RE-RUNS: the same story republished on a later day under new wording.
//      The prompts have told the model "never re-report a story from the last
//      7 days" since Sep 7 and it keeps doing it anyway (Sony/Warner v.
//      Anthropic ran four days straight; OpenAI "Astra" four times), which is
//      what makes a fresh drop read as yesterday's news. Titles are compared on
//      distinctive tokens; the FIRST airing is kept and later repeats are
//      deactivated, so each story reaches the reader exactly once.
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
// Look back further than the display window so a re-run is caught against the
// story's ORIGINAL airing, not just what is currently on screen.
const DEDUP_LOOKBACK_HOURS = 8 * 24;
// Minimum shared PHRASES (bigrams) for a repeat. 2 + the specificity test was
// the setting that cleared every false-positive probe on real data.
const DEDUP_MIN_SHARED = 2;

// Re-run matching works on PHRASES, not keywords. Two stories about the same
// company share words constantly ("Apple sues OpenAI" vs "Apple and OpenAI
// hardware"); only an actual repeat shares a specific phrase ("sue anthropic",
// "weathernext 3", "hugging face"). Validated against 199 real items over 8
// days: catches all 18 genuine repeats (Sony/Warner v. Anthropic ran FIVE
// times) with zero false positives on hand-built probes.

// Boilerplate: a phrase made only of these names no particular story.
const GENERIC = new Set(
  ("a an the of for and or to in on with by from as at is are be new ai agent agents agentic " +
   "model models llm llms tech data enterprise security future work industry report study " +
   "launches launch launched releases release released announces announced unveils debuts " +
   "brings adds gets makes says shows reveals plans expands begins starts opens major first " +
   "next more most now over under after before its their this that will can could would use " +
   "used using system systems tool tools platform company companies startup startups million " +
   "billion percent year years week day days").split(/\s+/)
);
// Company / model-family names. A phrase that is ONLY these identifies an org,
// not a story, so two different DeepMind stories must not collapse together.
const ORG = new Set(
  ("openai anthropic google deepmind meta microsoft apple nvidia amazon alibaba mistral stripe " +
   "claude gemini chatgpt copilot bytedance deepseek qwen runway perplexity xai grok llama gpt").split(/\s+/)
);

function bigrams(title) {
  const w = String(title || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const out = new Set();
  for (let i = 0; i < w.length - 1; i++) out.add(w[i] + " " + w[i + 1]);
  return out;
}

// Names something beyond boilerplate and beyond a bare company name.
function isSpecific(bg) {
  return bg.split(" ").some((w) => w.length >= 3 && !GENERIC.has(w) && !ORG.has(w));
}

// A repeat needs >=2 shared phrases, at least one of them specific.
function isRerunOf(bg, prevBg) {
  const sh = [...bg].filter((x) => prevBg.has(x));
  return sh.length >= DEDUP_MIN_SHARED && sh.some(isSpecific) ? sh : null;
}

// Curated to the beat the owner rejects; deliberately specific to avoid
// nuking legitimate stories that merely mention a chip.
// INFRASTRUCTURE BEAT — two different rules, because one keyword list cannot
// judge whether a story is interesting.
//
// HARD terms are the trade press's own procurement vocabulary. A story carrying
// one of these is about buying and building capacity; a reader who wanted it
// would be reading DigiTimes. These are still an outright ban.
const HARD_BEAT = [
  /gigawatts?/i,
  /megawatts?/i,
  /\bcapex\b/i,
  /\bhbm[0-9]?\b/i,
  /\bwafers?\b/i,
  /\bfoundry\b/i,
  /memory chips?/i,
  /chip (fab|plant|supply)/i,
  /supply chain.*(chip|semiconductor)/i,
  /(chip|semiconductor).*supply chain/i,
  /chip (production|manufacturing|fabrication)/i,
];

// SOFT terms only say a story involves compute or silicon, which plenty of good
// stories do. Banning on these was the bug: `\bai chips?\b` binned a startup
// fitting a language model into a hearing aid, and "China commits $532B to
// quadruple AI computing capacity" - arguably the biggest AI story of its day -
// was thrown out as supply-chain news.
//
// So SOFT is a CAP, not a ban, exactly like the outlet cap below: at most
// MAX_INFRA_PER_EDITION compute-flavoured stories per edition, newest kept.
// One is a story; six is the beat taking over the feed.
const SOFT_BEAT = [
  /\bai chips?\b/i,
  /(inference|custom|in-house) (ai )?(chips?|silicon|accelerators?)/i,
  /accelerator deployment/i,
  /comput(e|ing) capacity/i,
  /data ?cent(er|re)s? (build|expansion|deployment|capacity|compute|power|buildout)/i,
  /gpu (cluster|deployment|capacity)/i,
  /exaflops?/i,
];
const MAX_INFRA_PER_EDITION = 1;

const hay = (it) => `${it.title ?? ""} ${it.summary ?? ""}`;
// Outright ban: returns the matching pattern, or null.
function hardBeat(it) {
  const re = HARD_BEAT.find((r) => r.test(hay(it)));
  return re ? re.source.slice(0, 30) : null;
}
// Compute-flavoured: true if any soft term appears at all.
function isInfraFlavoured(it) {
  return SOFT_BEAT.some((r) => r.test(hay(it)));
}

// JUNK SOURCES. Measured 2026-09-09 over 27 days of the live feed: the named
// source list supplied ~11% of the daily section and the rest was whatever
// WebSearch returned - which is dominated by SEO-optimised "AI news roundup"
// pages, because those are engineered to rank for exactly the query the curator
// runs. These are content farms and press-release wires, never a primary report.
const JUNK_DOMAIN =
  /(^|\.)(techstartups\.com|skycrumbs\.com|imfounder\.com|aiweekly\.co|aiagentstore\.ai|releasebot\.io|unite\.ai|eesel\.ai|enterprisedna\.co|marktechpost\.com|dataconomy\.com|technology\.org|artificialintelligence-news\.com|pymnts\.com|latestly\.com|techtimes\.com|aibusinessweekly\.net|outsourceaccelerator\.com|aibusiness\.com)$/i;

// ROLLING INDEX PAGES. `aiweekly.co/ai-news-today` and
// `aiagentstore.ai/ai-agent-news/this-week` were each run five times as if they
// were stories. They are live index pages whose URL never changes and whose
// content is different every day, so they can never be deduped by URL either -
// they must simply never be treated as an article.
const ROLLING_INDEX =
  /\/(ai-news-today|ai-agent-news|this-week|this-month|today|latest|updates|roundup|news|blog|feed|index)\/?$/i;

function junkSource(it) {
  let u;
  try {
    u = new URL(String(it.url || ""));
  } catch {
    return "unparseable-url";
  }
  if (JUNK_DOMAIN.test(u.hostname.replace(/^www\./, ""))) return `farm:${u.hostname}`;
  if (ROLLING_INDEX.test(u.pathname)) return `rolling-index:${u.pathname}`;
  return null;
}

// Same story, same link, different wording. The bigram dedup below compares
// TITLES, so it misses a re-run whose headline was rewritten - which is exactly
// what happened: one DARPA URL ran 14 times over 17 days and all 14 stayed live.
// Normalise away the things that differ without changing the destination.
function urlKey(raw) {
  try {
    const u = new URL(String(raw));
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const path = u.pathname.replace(/\/+$/, "").toLowerCase();
    return `${host}${path}`;
  } catch {
    return String(raw || "").trim().toLowerCase();
  }
}

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
  const since = new Date(Date.now() - DEDUP_LOOKBACK_HOURS * 3600_000).toISOString();
  const capSince = Date.now() - WINDOW_HOURS * 3600_000;
  const items = await sb(
    `items?is_active=eq.true&section=in.(daily,articles)&published_at=gte.${since}` +
      `&select=id,section,source,title,summary,url,edition_date,published_at&order=published_at.desc&limit=900`
  );
  if (!items?.length) {
    console.log("taste-gate: nothing in window");
    return;
  }

  // 0. Junk sources: content farms, wire reprints, and rolling index pages.
  const junk = items.filter((it) => junkSource(it));
  if (junk.length) {
    await deactivate(junk.map((j) => j.id), "junk-source");
    junk.forEach((j) =>
      console.log(`    junk[${junkSource(j)}]: ${String(j.title).slice(0, 54)}`)
    );
  }
  const junkIds = new Set(junk.map((j) => j.id));

  // 1. Banned beat - procurement vocabulary only (see HARD_BEAT).
  const banned = items.filter((it) => !junkIds.has(it.id) && hardBeat(it));
  if (banned.length) {
    await deactivate(
      banned.map((b) => b.id),
      "banned-beat"
    );
    banned.forEach((b) =>
      console.log(`    beat[${hardBeat(b)}]: ${String(b.title).slice(0, 60)}`)
    );
  }

  // 1b. Infrastructure CAP. Compute-flavoured stories are allowed - one of them
  //     can genuinely be the day's biggest story - but only
  //     MAX_INFRA_PER_EDITION of them per edition, newest first, so the beat
  //     can never take over the feed the way it used to.
  const gatedIds = new Set([...junkIds, ...banned.map((b) => b.id)]);
  const perEditionInfra = new Map();
  const overInfra = [];
  for (const it of items) {
    if (gatedIds.has(it.id) || it.section !== "daily") continue;
    if (!isInfraFlavoured(it)) continue;
    const key = it.edition_date;
    const n = (perEditionInfra.get(key) || 0) + 1;
    perEditionInfra.set(key, n);
    if (n > MAX_INFRA_PER_EDITION) overInfra.push(it);
  }
  if (overInfra.length) {
    await deactivate(
      overInfra.map((o) => o.id),
      "infra-cap"
    );
    overInfra.forEach((o) =>
      console.log(`    infra: ${String(o.title).slice(0, 66)}`)
    );
    overInfra.forEach((o) => gatedIds.add(o.id));
  }

  // 1c. Exact-URL re-runs. Oldest airing wins; every later one is dropped.
  const byUrl = new Map();
  const urlDupes = [];
  for (const it of [...items].sort(
    (a, b) => Date.parse(a.published_at) - Date.parse(b.published_at)
  )) {
    if (gatedIds.has(it.id)) continue;
    const k = urlKey(it.url);
    if (!k) continue;
    if (byUrl.has(k)) urlDupes.push({ it, first: byUrl.get(k) });
    else byUrl.set(k, it);
  }
  if (urlDupes.length) {
    await deactivate(urlDupes.map((d) => d.it.id), "same-url-rerun");
    urlDupes.forEach((d) =>
      console.log(
        `    same-url: ${String(d.it.title).slice(0, 50)} == ${String(d.first.title).slice(0, 40)}`
      )
    );
    urlDupes.forEach((d) => gatedIds.add(d.it.id));
  }

  // 2. Outlet caps (daily only; newest kept). Items already gated above are out.
  const daily = items.filter(
    (it) =>
      it.section === "daily" &&
      !gatedIds.has(it.id) &&
      Date.parse(it.published_at) >= capSince
  );
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

  // 3. Re-runs. Walk OLDEST -> NEWEST so the first airing claims the story and
  //    every later restatement of it is dropped.
  overCap.forEach((o) => gatedIds.add(o.id));
  const chron = items
    .filter((it) => !gatedIds.has(it.id))
    .slice()
    .sort((a, b) => Date.parse(a.published_at) - Date.parse(b.published_at));
  const seen = []; // { bg, title, day }
  const reruns = [];
  for (const it of chron) {
    const bg = bigrams(it.title);
    let hit = null;
    for (const prev of seen) {
      const sh = isRerunOf(bg, prev.bg);
      if (sh) {
        hit = { ...prev, sh };
        break;
      }
    }
    if (hit) reruns.push({ it, of: hit });
    else seen.push({ bg, title: it.title, day: it.edition_date });
  }
  if (reruns.length) {
    await deactivate(
      reruns.map((r) => r.it.id),
      "re-run"
    );
    reruns.forEach((r) =>
      console.log(
        `    rerun: "${String(r.it.title).slice(0, 52)}" repeats "${String(r.of.title).slice(0, 52)}" (${r.of.day})`
      )
    );
  }

  console.log(
    `taste-gate done: checked=${items.length} banned-beat=${banned.length} outlet-cap=${overCap.length} re-runs=${reruns.length}`
  );
}

main().catch((e) => die(e.message));
