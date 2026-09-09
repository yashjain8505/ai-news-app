#!/usr/bin/env node
// Rewrites an edition's curator-written headlines into plain English.
//
// Curator titles read like press releases ("NSA, CISA, FBI Warn of Chinese AI
// Firms Conducting Industrial-Scale Model Distillation"). This fills two columns
// on public.items so every surface can show something a normal person can read
// on a phone:
//   plain_title  <= 60 chars, sentence case, no jargon
//   plain_line   1-2 short sentences: what happened and why it matters
//
// Flow:
//   1. Resolve the edition (EDITION_DATE, else the latest active edition_date).
//   2. Fetch that edition's active items.
//   3. Skip items that already have BOTH plain fields (idempotent) unless FORCE=1.
//   4. One `claude -p` call for the whole edition (uses the `claude` CLI +
//      CLAUDE_CODE_OAUTH_TOKEN — the subscription, never an API key).
//   5. Validate each result and PATCH it back one item at a time, so one bad
//      row cannot sink the rest.
//
// THIS SCRIPT MUST NEVER FAIL THE JOB. It runs immediately before the daily
// newsletter send, and every consumer already falls back to title/summary when
// a plain field is null. Missing CLI, non-zero exit, unparseable JSON, network
// error, partial results: all are caught, logged, and the process exits 0 with
// whatever valid subset it managed to write.
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY   (service role; anon key works for reads)
//   EDITION_DATE     YYYY-MM-DD, blank = latest active edition
//   SIMPLIFY_MODEL   optional claude model override (blank = account default)
//   DRY_RUN=1        print what it would write, write nothing
//   FORCE=1          redo items that already have both plain fields

import { execFileSync } from "node:child_process";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://zrjbzowohsgjbrhsldfi.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const SIMPLIFY_MODEL = process.env.SIMPLIFY_MODEL || "";
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const FORCE = process.env.FORCE === "1" || process.env.FORCE === "true";
const EDITION_DATE = (process.env.EDITION_DATE || "").trim();

const MAX_ITEMS = 60;        // one call; editions run ~16 items
const CLAUDE_TIMEOUT_MS = 180000;
const TITLE_TARGET = 60;     // the rule we ask for
const TITLE_HARD_MAX = 90;   // beyond this it is not a headline, drop it
const LINE_TARGET = 160;
const LINE_HARD_MAX = 240;

// Nothing below is allowed to take the process down with a non-zero code.
const bail = (msg) => { console.log(`→ ${msg}`); process.exitCode = 0; };
process.on("unhandledRejection", (e) => {
  console.warn(`⚠ unhandled rejection: ${e?.message || e}`);
  process.exit(0);
});
process.on("uncaughtException", (e) => {
  console.warn(`⚠ uncaught exception: ${e?.message || e}`);
  process.exit(0);
});
// Last-resort watchdog: never hold the newsletter hostage to a hung socket.
setTimeout(() => {
  console.warn("⚠ simplify-edition watchdog fired (8m). Exiting 0.");
  process.exit(0);
}, 8 * 60 * 1000).unref();

async function sb(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`Supabase ${init.method || "GET"} ${path} -> ${res.status} ${body.slice(0, 200)}`);
  return body ? JSON.parse(body) : null;
}

// Plain English has no em/en dashes: number ranges keep a hyphen, everything
// else becomes a comma, which is how a person would actually say it.
function deDash(s) {
  return String(s ?? "")
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")
    .replace(/\s*[–—]\s*/g, ", ");
}

function clean(s) {
  let t = deDash(s)
    .replace(/[`*_]+/g, "")          // stray markdown
    .replace(/\s+/g, " ")            // newlines/tabs -> single spaces
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")  // wrapping quotes
    .trim();
  return t;
}

// ---- the prompt -------------------------------------------------------------
function buildPrompt(items) {
  const list = items
    .map(
      (it, i) =>
        `${i + 1}. id: ${it.id}\n   section: ${it.section || "news"}\n   TITLE: ${clean(it.title)}\n   SUMMARY: ${clean(it.summary) || "(none)"}`
    )
    .join("\n\n");

  return `You rewrite AI-news headlines into plain English for someone reading on a phone. The originals are written like press releases: Title Case, jargon-heavy, full of terms a normal person has never heard. Your job is to say the same thing the way you would say it out loud to a friend.

For EACH story below, write two things.

1. "plain_title" - the headline in plain English.
   - 60 characters or fewer. Sentence case, so capitalise only the first word and proper nouns. Not Title Case.
   - Everyday words, active voice. Say who did what.
   - No jargon. No colons. No em dashes or en dashes. No quotation marks. No trailing full stop.
   - Good: "OpenAI's new model can use a computer on its own"
   - Good: "US agencies say China is copying American AI"

2. "plain_line" - one or two short sentences: what happened, and why a normal person should care.
   - 160 characters or fewer in total. Plain English, full sentences.
   - No em dashes or en dashes.

THE RULES THAT MATTER MOST:
- Never invent facts. Rephrase ONLY what is in the TITLE and SUMMARY you are given. Add no context, no predictions, no numbers, no names that are not already there. If you are unsure what something means, describe it more vaguely rather than guessing.
- If a term is unavoidable jargon, explain it in ordinary words. "Model distillation" becomes "training a copycat AI on another company's answers".
- Keep concrete numbers and company names, they are the interesting part: "$275M", "Nvidia", "40%".
- Not clickbait. No hype. Never "game-changing", "revolutionary", "massive", "shocking". No question headlines, no teasing.
- Plainer, not different. The meaning must survive.

WORKED EXAMPLE:
TITLE: "NSA, CISA, FBI Warn of Chinese AI Firms Conducting Industrial-Scale Model Distillation"
SUMMARY: "Joint advisory says Chinese labs are systematically training on outputs from US frontier models."
plain_title: "US agencies say China is copying American AI"
plain_line: "Three US security agencies say Chinese labs are training their AI on answers from American models. It is the cheapest way to catch up."

STORIES:

${list}

Return STRICT JSON and nothing else. No prose before or after it, no markdown code fences:
{"results":[{"id":"<the id exactly as given above>","plain_title":"...","plain_line":"..."}]}

Include one object for every story listed above, in the same order.`;
}

// ---- claude -----------------------------------------------------------------
function claudeJSON(prompt) {
  try {
    const args = ["-p", prompt, "--output-format", "text"];
    if (SIMPLIFY_MODEL) args.splice(2, 0, "--model", SIMPLIFY_MODEL);
    const out = execFileSync("claude", args, {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: CLAUDE_TIMEOUT_MS,
      env: process.env,
    });
    return parseResults(out);
  } catch (e) {
    // execFileSync puts the whole argv (i.e. the entire prompt) in e.message.
    // Prefer stderr and keep it short so a CI log stays readable.
    const stderr = e?.stderr ? String(e.stderr).trim() : "";
    const detail = (stderr || e?.message || String(e)).replace(/\s+/g, " ").slice(0, 300);
    const status = e?.status != null ? ` [exit ${e.status}]` : "";
    console.warn(`⚠ claude rewriting unavailable${status}: ${detail}`);
    console.warn("  Leaving plain fields as they are; the edition keeps its original titles.");
    return null;
  }
}

// Defensive: strip fences if the model added them, else take the outermost
// {...} span out of whatever prose came back.
function parseResults(out) {
  const text = String(out || "");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [];
  if (fenced) candidates.push(fenced[1]);
  const braced = text.match(/\{[\s\S]*\}/);
  if (braced) candidates.push(braced[0]);
  candidates.push(text);

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c.trim());
      const results = Array.isArray(parsed) ? parsed : parsed?.results;
      if (Array.isArray(results)) return results;
    } catch {
      /* try the next shape */
    }
  }
  throw new Error("no parseable JSON in claude output");
}

// ---- validation -------------------------------------------------------------
function validate(row, byId, bySlug) {
  const key = String(row?.id ?? "").trim();
  const item = byId.get(key) || bySlug.get(key) || bySlug.get(String(row?.slug ?? "").trim());
  if (!item) return { skip: `unknown id "${key.slice(0, 60)}"` };

  let title = clean(row?.plain_title).replace(/\.+$/, "").trim();
  let line = clean(row?.plain_line);

  if (!title || !line) return { skip: `${item.slug}: empty plain_title or plain_line` };
  if (title.length > TITLE_HARD_MAX) return { skip: `${item.slug}: plain_title ${title.length} chars, not a headline` };
  if (line.length > LINE_HARD_MAX) return { skip: `${item.slug}: plain_line ${line.length} chars, too long to be one or two sentences` };

  const warn = [];
  if (title.length > TITLE_TARGET) warn.push(`title ${title.length}/${TITLE_TARGET}`);
  if (line.length > LINE_TARGET) warn.push(`line ${line.length}/${LINE_TARGET}`);
  if (title.includes(":")) warn.push("title has a colon");

  return { item, title, line, warn };
}

// ---- main -------------------------------------------------------------------
async function main() {
  if (!SERVICE_KEY) return bail("No SUPABASE_SERVICE_KEY. Skipping the plain-English pass (titles fall back to the originals).");

  // 1. Which edition?
  let editionDate = EDITION_DATE;
  if (editionDate && !/^\d{4}-\d{2}-\d{2}$/.test(editionDate)) {
    console.warn(`⚠ EDITION_DATE "${editionDate}" is not YYYY-MM-DD. Using the latest edition instead.`);
    editionDate = "";
  }
  if (!editionDate) {
    const latest = await sb("items?is_active=eq.true&edition_date=not.is.null&select=edition_date&order=edition_date.desc&limit=1");
    editionDate = latest?.[0]?.edition_date || "";
  }
  if (!editionDate) return bail("No edition found. Nothing to simplify.");
  console.log(`→ Simplifying edition ${editionDate}`);

  // 2. The edition's items.
  const items = await sb(
    `items?is_active=eq.true&edition_date=eq.${encodeURIComponent(editionDate)}&select=id,slug,section,title,summary,plain_title,plain_line&order=section.asc`
  );
  if (!items?.length) return bail(`No active items for ${editionDate}. Nothing to simplify.`);

  // 3. Only the ones still missing a plain version.
  const pendingAll = FORCE ? items : items.filter((it) => !(it.plain_title && it.plain_line));
  if (!pendingAll.length) {
    return bail(`All ${items.length} items already have plain_title and plain_line. Nothing to do (FORCE=1 to redo).`);
  }
  const pending = pendingAll.slice(0, MAX_ITEMS);
  if (pendingAll.length > MAX_ITEMS) console.warn(`⚠ ${pendingAll.length} pending, doing the first ${MAX_ITEMS} in this run.`);
  console.log(`→ ${pending.length} of ${items.length} items need plain English${FORCE ? " (FORCE)" : ""}`);

  // 4. One call for the whole edition.
  const results = claudeJSON(buildPrompt(pending));
  if (!results) return bail("No rewrites this run. The edition keeps its original titles.");
  console.log(`→ Claude returned ${results.length} result(s)`);

  // 5. Validate, then write one item at a time.
  const byId = new Map(pending.map((it) => [String(it.id), it]));
  const bySlug = new Map(pending.map((it) => [String(it.slug), it]));
  const seen = new Set();
  let written = 0;
  let skipped = 0;

  for (const row of results) {
    const v = validate(row, byId, bySlug);
    if (v.skip) { console.warn(`  ⚠ skipped: ${v.skip}`); skipped++; continue; }
    if (seen.has(v.item.id)) { console.warn(`  ⚠ skipped: duplicate result for ${v.item.slug}`); skipped++; continue; }
    seen.add(v.item.id);

    console.log(`  • ${v.title}${v.warn.length ? `   [${v.warn.join(", ")}]` : ""}`);
    console.log(`    ${v.line}`);

    if (DRY_RUN) { written++; continue; }
    try {
      await sb(`items?id=eq.${encodeURIComponent(v.item.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ plain_title: v.title, plain_line: v.line }),
      });
      written++;
    } catch (e) {
      console.warn(`  ⚠ write failed for ${v.item.slug}: ${e.message}`);
      skipped++;
    }
  }

  const missing = pending.length - seen.size;
  if (missing > 0) console.warn(`⚠ ${missing} item(s) got no usable rewrite and keep their original titles.`);
  console.log(
    DRY_RUN
      ? `\n[DRY RUN] Would have written ${written} item(s). ${skipped} skipped.`
      : `✓ Wrote plain English for ${written} of ${pending.length} item(s). ${skipped} skipped.`
  );
}

main().catch((e) => {
  console.warn(`⚠ simplify-edition failed (${e?.message || e}). The newsletter is unaffected: items keep their original titles.`);
  process.exitCode = 0;
});
