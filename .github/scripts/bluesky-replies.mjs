#!/usr/bin/env node
// Drafts a few honest replies to fresh Bluesky posts and schedules them into
// bluesky_scheduled, spread ~35 min apart, so replies trickle out across the day
// instead of in bursts. Runs several times a day (see bluesky-replies.yml); the
// drip endpoint posts each when due. Nothing is emailed, nothing is approved.
//
// Safety rails (this is the account-risk knob): a per-day cap so we never
// overshoot, one reply per author per day (never spam the same person), and only
// real Claude drafts ship. Ramp: ~5/run x 4 runs, capped at REPLIES_PER_DAY.
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY   (service role)
//   CLAUDE_CODE_OAUTH_TOKEN              (drafting, via the claude CLI)
//   BLUESKY_IDENTIFIER                   our handle (search excludes ourselves)
//   REPLIES_PER_RUN     default 5    how many to schedule per run
//   REPLIES_PER_DAY     default 24   hard daily cap across all runs
//   SPREAD_MIN          default 35   minutes between this run's scheduled replies
//   DRY_RUN=1           draft + print, schedule nothing

import { execFileSync } from "node:child_process";
import { findReplyTargets } from "./lib/bluesky-search.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://zrjbzowohsgjbrhsldfi.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const DRAFT_MODEL = process.env.DRAFT_MODEL || "";
const PER_RUN = Math.max(1, Number(process.env.REPLIES_PER_RUN) || 5);
const PER_DAY = Math.max(1, Number(process.env.REPLIES_PER_DAY) || 24);
const SPREAD_MIN = Math.max(5, Number(process.env.SPREAD_MIN) || 35);
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const die = (m) => { console.error(`✗ ${m}`); process.exit(1); };
const authorDid = (uri) => (uri || "").split("/")[2] || "";
function deDash(s) {
  return String(s || "").replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2").replace(/\s*[–—]\s*/g, ", ").replace(/\s+/g, " ").trim();
}

async function sb(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const body = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`Supabase ${init.method || "GET"} ${path} -> ${res.status} ${body.slice(0, 200)}`);
  return body ? JSON.parse(body) : null;
}

function claudeJSON(prompt) {
  try {
    const args = ["-p", prompt, "--output-format", "text"];
    if (DRAFT_MODEL) args.splice(2, 0, "--model", DRAFT_MODEL);
    const out = execFileSync("claude", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 180000, env: process.env });
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no JSON in claude output");
    return JSON.parse(m[0]);
  } catch (e) {
    console.warn(`⚠ claude drafting unavailable (${e.message}).`);
    return null;
  }
}

function buildPrompt(targets) {
  const list = targets.map((t, i) => `${i + 1}. @${t.authorHandle} posted: "${(t.text || "").replace(/\s+/g, " ").slice(0, 240)}"`).join("\n");
  return `You reply on Bluesky as the person behind Wortins, an independent AI-news brief. You are one real person, not a brand. For each post below, write ONE reply.

RULES:
- Read what they actually said and react to THAT specifically. Add a real point, a fact, or a genuine disagreement.
- Plain, clear, honest, a little understated. Contractions fine.
- Never "great point" or empty agreement. Never restate their post. Never a fake-deep closer ("kind of the real story", "makes you think", etc.). No em dashes. No hashtags, no links, no emoji. Under 290 characters.
- If you have nothing genuine to add to a post, return an empty string for it.

POSTS:
${list}

Return ONLY a JSON object: {"replies": ["<reply to post 1>", ... exactly ${targets.length} in order, empty string to skip]}`;
}

async function main() {
  if (!SERVICE_KEY) die("SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY for a dry run) is required");
  const dateISO = new Date().toISOString().slice(0, 10);

  // Who have we already queued a reply to today? Cap the daily total and never
  // reply to the same author twice in a day.
  const todays = (await sb(`bluesky_scheduled?run_date=eq.${dateISO}&kind=eq.reply&select=reply_uri`).catch(() => [])) || [];
  const room = PER_DAY - todays.length;
  if (room <= 0) { console.log(`✓ Daily cap reached (${todays.length}/${PER_DAY}). Nothing to do.`); return; }
  const repliedAuthors = new Set(todays.map((r) => authorDid(r.reply_uri)));
  const want = Math.min(PER_RUN, room);

  // Find fresh, high-signal targets we haven't replied to today.
  let found = [];
  try { found = await findReplyTargets({ limit: want * 4 }); } catch (e) { console.warn(`⚠ search failed: ${e.message}`); }
  const fresh = found.filter((t) => t.uri && t.cid && !repliedAuthors.has(authorDid(t.uri))).slice(0, want);
  if (!fresh.length) { console.log("No fresh reply targets right now."); return; }
  console.log(`→ ${fresh.length} targets (room ${room}/${PER_DAY} today)`);

  const drafted = claudeJSON(buildPrompt(fresh));
  if (!drafted) { console.log("Skipping (no Claude drafts)."); return; }
  const replies = Array.isArray(drafted.replies) ? drafted.replies : [];
  const rows = fresh
    .map((t, i) => ({ t, text: deDash(replies[i] || "") }))
    .filter((r) => r.text && r.text.length <= 300);

  console.log("─".repeat(56));
  rows.forEach((r) => console.log(`@${r.t.authorHandle}: ${r.text}`));
  console.log("─".repeat(56));
  if (!rows.length) { console.log("Nothing to schedule."); return; }
  if (DRY_RUN) { console.log("\n[DRY RUN] Nothing scheduled."); return; }

  const base = Date.now();
  const at = (min) => new Date(base + min * 60000).toISOString();
  const scheduled = rows.map((r, i) => ({
    run_date: dateISO, slot: "reply", kind: "reply", story_slug: null,
    reply_uri: r.t.uri, reply_cid: r.t.cid, text: r.text,
    scheduled_for: at(i * SPREAD_MIN), status: "pending",
  }));
  await sb("bluesky_scheduled", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(scheduled) });
  console.log(`✓ Scheduled ${scheduled.length} replies, ${SPREAD_MIN}min apart (day total now ${todays.length + scheduled.length}/${PER_DAY}).`);
}

main().catch((e) => die(e.message));
