#!/usr/bin/env node
// Post-curation content guard. Runs right after the curator drops a fresh
// edition and HTTP-checks every image and source link, so a fabricated or dead
// URL never reaches readers. No LLM, ~free (just HTTP HEAD/GET probes).
//
//   - Image that isn't a live image (404/410/timeout/not-an-image) -> null it
//     (a clean text card is fine; a broken image is not).
//   - Source link that is clearly GONE (404/410 or DNS failure) -> deactivate
//     the item (a story you can't cite is useless). A 403 is NOT treated as dead,
//     since many real sites bot-block HEAD requests.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (required), EDITION_DATE (optional).

const SUPABASE_URL = process.env.SUPABASE_URL || "https://zrjbzowohsgjbrhsldfi.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_KEY;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const TIMEOUT = 9000;
const CONCURRENCY = 8;

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
  if (!res.ok) throw new Error(`Supabase ${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

async function probe(url) {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { "User-Agent": UA, Range: "bytes=0-0", Accept: "*/*" },
    });
    return { ok: res.ok, status: res.status, type: res.headers.get("content-type") || "" };
  } catch (e) {
    return { ok: false, status: 0, type: "", err: String(e && e.message ? e.message : e).slice(0, 60) };
  }
}

async function mapLimit(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const day = process.env.EDITION_DATE || new Date().toISOString().slice(0, 10);
  const items = await sb(`items?is_active=eq.true&edition_date=eq.${day}&select=id,url,image_url,title`);
  if (!items?.length) {
    console.log(`No active items for ${day}.`);
    return;
  }
  console.log(`Verifying ${items.length} items for ${day}...`);

  let nulledImages = 0;
  let deactivated = 0;

  await mapLimit(items, CONCURRENCY, async (it) => {
    if (it.image_url) {
      const r = await probe(it.image_url);
      const good = r.ok && /^image\//i.test(r.type);
      if (!good) {
        await sb(`items?id=eq.${it.id}`, { method: "PATCH", body: JSON.stringify({ image_url: null }) });
        nulledImages++;
        console.log(`  img✗ (${r.status || r.err}) ${String(it.title).slice(0, 46)}`);
      }
    }
    if (it.url) {
      const r = await probe(it.url);
      const gone =
        r.status === 404 ||
        r.status === 410 ||
        (r.status === 0 && /not found|enotfound|dns|getaddrinfo/i.test(r.err || ""));
      if (gone) {
        await sb(`items?id=eq.${it.id}`, { method: "PATCH", body: JSON.stringify({ is_active: false }) });
        deactivated++;
        console.log(`  link✗ (${r.status || r.err}) DEACTIVATED ${String(it.title).slice(0, 42)}`);
      }
    }
  });

  console.log(`Done. Nulled ${nulledImages} dead images, deactivated ${deactivated} dead-link items.`);
}

main().catch((e) => die(e.message));
