#!/usr/bin/env node
// Synthesizes ONE AI SEO action plan for a queued job row.
//
// Flow: read the pending `seo_briefs` row (by BRIEF_ID) — its `input` holds the
// Search Console evidence the dashboard already computed — ask Claude (via the
// `claude` CLI + CLAUDE_CODE_OAUTH_TOKEN, i.e. the Max subscription, NO API key)
// to synthesize the brief, then PATCH the row to 'ready' (or 'error'). Mirrors
// bluesky-prepare.mjs: Supabase REST + the claude CLI, self-contained.
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY   (service role — bypasses RLS)
//   CLAUDE_CODE_OAUTH_TOKEN              (subscription auth for the claude CLI)
//   BRIEF_ID                             the seo_briefs row to synthesize
//   SEO_BRIEF_MODEL                      claude model alias (default 'sonnet')

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://zrjbzowohsgjbrhsldfi.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BRIEF_ID = process.env.BRIEF_ID;
const MODEL = (process.env.SEO_BRIEF_MODEL || "sonnet").trim();

const die = (m) => { console.error(`✗ ${m}`); process.exit(1); };
const here = dirname(fileURLToPath(import.meta.url));

// ---- Supabase REST ----------------------------------------------------------
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

async function patch(fields) {
  await sb(`seo_briefs?id=eq.${BRIEF_ID}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(fields),
  });
}

// ---- Claude synthesis (via the CLI; subscription auth, no API key) -----------
function claudeBrief(prompt) {
  const out = execFileSync(
    "claude",
    ["-p", prompt, "--model", MODEL, "--output-format", "text", "--dangerously-skip-permissions", "--max-turns", "3"],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 180000, env: process.env },
  );
  const start = out.indexOf("{");
  const end = out.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in Claude output");
  const obj = JSON.parse(out.slice(start, end + 1));
  if (!obj.headline || !Array.isArray(obj.working)) throw new Error("brief JSON missing required fields");
  const oneOf = (v, allowed) => (typeof v === "string" && allowed.includes(v) ? v : undefined);
  return {
    headline: String(obj.headline),
    working: (obj.working || []).map(String),
    broken: (obj.broken || []).map(String),
    doNext: (obj.doNext || [])
      .filter((d) => d && typeof d === "object")
      .map((d) => ({
        action: String(d.action || ""),
        why: String(d.why || ""),
        impact: oneOf(d.impact, ["high", "medium", "low"]),
        effort: oneOf(d.effort, ["quick", "medium", "involved"]),
      })),
    caveat: obj.caveat ? String(obj.caveat) : undefined,
  };
}

// ---- main -------------------------------------------------------------------
async function main() {
  if (!SERVICE_KEY) die("SUPABASE_SERVICE_KEY required");
  if (!BRIEF_ID) die("BRIEF_ID required");

  const rows = await sb(`seo_briefs?id=eq.${BRIEF_ID}&select=id,status,input`);
  const row = rows?.[0];
  if (!row) die(`brief ${BRIEF_ID} not found`);
  if (row.status !== "pending") {
    console.log(`brief ${BRIEF_ID} is '${row.status}', nothing to do`);
    return;
  }

  const system = readFileSync(join(here, "seo-brief-prompt.md"), "utf8");
  const prompt = `${system}\n\nSEARCH CONSOLE SNAPSHOT (JSON):\n${JSON.stringify(row.input)}\n\nReturn ONLY the JSON object described above.`;

  console.log(`→ Synthesizing brief ${BRIEF_ID} (model=${MODEL})…`);
  const brief = claudeBrief(prompt);
  await patch({ status: "ready", brief, model: MODEL, error: null, generated_at: new Date().toISOString() });
  console.log(`✓ brief ${BRIEF_ID} ready — ${brief.doNext.length} actions`);
}

main().catch(async (e) => {
  // Best-effort: flip the row to 'error' so the dashboard stops polling.
  try {
    await patch({ status: "error", error: String(e.message).slice(0, 500), generated_at: new Date().toISOString() });
  } catch {}
  die(e.message);
});
