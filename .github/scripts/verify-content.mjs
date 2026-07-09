#!/usr/bin/env node
// Image resolver + content guard. Runs right after the curator drops a fresh
// edition (and can be run standalone on any EDITION_DATE). No LLM, ~free.
//
// For each active item in the day's edition:
//   1. Fetch the article's RAW HTML. (The curator's WebFetch returns processed
//      text, not markup, so it can't see meta tags — that's why images kept
//      coming back empty. A raw fetch here can.)
//   2. If the item has no image, parse the real og:image / twitter:image out of
//      that HTML.
//   3. Validate the image actually renders through our proxy (weserv, the exact
//      path the browser uses). If it doesn't load, null it — a clean text card
//      beats a broken one.
//   4. If the source link itself is clearly GONE (404/410 or DNS failure),
//      deactivate the item (a story you can't cite is useless). A 403 is NOT
//      treated as dead — many real sites bot-block datacenter requests.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (required), EDITION_DATE (optional).

const SUPABASE_URL = process.env.SUPABASE_URL || "https://zrjbzowohsgjbrhsldfi.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_KEY;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const TIMEOUT = 10000;
const CONCURRENCY = 6;

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

// The exact URL the app renders (mirrors optImg() in src/lib/img.ts).
function weservUrl(src) {
  const enc = encodeURIComponent(src.replace(/^https?:\/\//i, ""));
  return `https://images.weserv.nl/?url=${enc}&w=800&output=webp&q=80`;
}

// Fetch the article once; reused for both link-liveness and og:image parsing.
async function fetchArticle(url) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" },
    });
    const type = res.headers.get("content-type") || "";
    let html = "";
    if (res.ok && /text\/html|xml/i.test(type)) html = (await res.text()).slice(0, 600000);
    return { status: res.status, html, finalUrl: res.url || url };
  } catch (e) {
    return { status: 0, html: "", finalUrl: url, err: String(e && e.message ? e.message : e).slice(0, 60) };
  }
}

// Some publishers serve og:image through their own proxy that our image CDN
// can't fetch. Unwrap the common one (Jetpack Photon: i0.wp.com/<origin-url>)
// back to the origin, which the CDN can proxy.
function normalizeImg(img) {
  const m = img.match(/^https?:\/\/i[0-9]\.wp\.com\/(.+)$/i);
  if (m) return "https://" + m[1];
  return img;
}

function parseOgImage(html, pageUrl) {
  if (!html) return null;
  // content-first and property-first orderings; og:image, its secure variant,
  // and twitter:image as a fallback.
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:og:image:secure_url|og:image|twitter:image(?::src)?)["'][^>]*?content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*?(?:property|name)=["'](?:og:image:secure_url|og:image|twitter:image(?::src)?)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      let img = m[1].trim().replace(/&amp;/g, "&");
      if (img.startsWith("//")) img = "https:" + img;
      else if (img.startsWith("/")) {
        try {
          img = new URL(pageUrl).origin + img;
        } catch {
          return null;
        }
      }
      if (/^https?:\/\//i.test(img)) return normalizeImg(img);
    }
  }
  return null;
}

// Does this image actually render through our proxy (the real browser path)?
async function imageRenders(src) {
  try {
    const res = await fetch(weservUrl(src), {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { "User-Agent": UA },
    });
    return res.ok && /^image\//i.test(res.headers.get("content-type") || "");
  } catch {
    return false;
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
  console.log(`Resolving images + checking links for ${items.length} items (${day})...`);

  let resolved = 0;
  let nulled = 0;
  let deactivated = 0;

  await mapLimit(items, CONCURRENCY, async (it) => {
    const art = it.url ? await fetchArticle(it.url) : { status: 0, html: "", finalUrl: it.url };

    // Dead source link -> deactivate (only clear "gone", not bot-block 403s).
    const gone =
      art.status === 404 ||
      art.status === 410 ||
      (art.status === 0 && /not found|enotfound|dns|getaddrinfo/i.test(art.err || ""));
    if (gone) {
      await sb(`items?id=eq.${it.id}`, { method: "PATCH", body: JSON.stringify({ is_active: false }) });
      deactivated++;
      console.log(`  link✗ (${art.status || art.err}) DEACTIVATED ${String(it.title).slice(0, 42)}`);
      return;
    }

    // Resolve an image: keep a working one, else pull the article's og:image;
    // then confirm whatever we have actually renders.
    const had = it.image_url || null;
    let img = had;
    if (!img) img = parseOgImage(art.html, art.finalUrl || it.url);
    if (img && !(await imageRenders(img))) img = null;

    if (img !== had) {
      await sb(`items?id=eq.${it.id}`, { method: "PATCH", body: JSON.stringify({ image_url: img }) });
      if (img) {
        resolved++;
        console.log(`  img✓ ${String(it.title).slice(0, 48)}`);
      } else {
        nulled++;
        console.log(`  img✗ (broken) ${String(it.title).slice(0, 42)}`);
      }
    }
  });

  console.log(
    `Done. Resolved ${resolved} images, nulled ${nulled} broken, deactivated ${deactivated} dead-link items.`
  );
}

main().catch((e) => die(e.message));
