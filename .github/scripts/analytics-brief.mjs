// Generates the /admin/analytics "AI analyst brief" using the `claude` CLI
// (your Claude subscription via CLAUDE_CODE_OAUTH_TOKEN) and stores it in the
// analytics_briefs table. NO Anthropic API key. Run by analytics-brief.yml.
//
// Flow:
//   1. Fetch the computed AnalyticsOverview from the app's service-key-gated
//      /api/admin/brief-input endpoint (reuses the app's GA + Supabase logic —
//      no duplication here).
//   2. Pipe it to `claude -p "<analyst prompt>"` (data on stdin) → brief JSON.
//   3. Upsert into analytics_briefs via the Supabase REST API (service role).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://zrjbzowohsgjbrhsldfi.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const APP_URL = process.env.APP_URL || "https://www.wortins.com";
const RANGE = parseInt(process.env.RANGE || "28", 10);
const MODEL = process.env.BRIEF_MODEL || "sonnet";

if (!SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_KEY is not set");
  process.exit(1);
}

// --- 1. fetch the analytics snapshot -----------------------------------------
const inputUrl = `${APP_URL}/api/admin/brief-input?range=${RANGE}`;
const inputRes = await fetch(inputUrl, {
  headers: { Authorization: `Bearer ${SERVICE_KEY}` },
});
if (!inputRes.ok) {
  const body = await inputRes.text().catch(() => "");
  console.error(`brief-input fetch failed: ${inputRes.status} ${body.slice(0, 300)}`);
  process.exit(1);
}
const overview = await inputRes.json();
console.log(`fetched analytics snapshot for range=${RANGE}`);

// --- 2. run it through the claude CLI ----------------------------------------
const promptPath = new URL("./analytics-brief-prompt.md", import.meta.url);
const promptText = readFileSync(promptPath, "utf8");
// Embed the data in the prompt arg (not stdin): the repo's other claude
// workflows pass everything via -p, and arg-passing sidesteps any
// version-dependent stdin-handling ambiguity in the CLI. The overview is only
// a few KB, well under ARG_MAX, and execFileSync passes args without a shell so
// there's nothing to escape.
const fullPrompt = `${promptText}\n\n=== ANALYTICS SNAPSHOT (JSON) ===\n${JSON.stringify(
  overview
)}`;

let raw;
try {
  // One turn, no tools; the data is appended to the instructions above.
  raw = execFileSync(
    "claude",
    [
      "-p",
      fullPrompt,
      "--output-format",
      "json",
      "--max-turns",
      "1",
      "--model",
      MODEL,
      "--dangerously-skip-permissions",
    ],
    {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 180_000,
    }
  );
} catch (e) {
  console.error("claude CLI failed:", e.message);
  if (e.stdout) console.error("stdout:", String(e.stdout).slice(0, 500));
  if (e.stderr) console.error("stderr:", String(e.stderr).slice(0, 500));
  process.exit(1);
}

// The CLI's --output-format json envelope: claude's text is in `.result`.
let text;
try {
  const env = JSON.parse(raw);
  text = env.result ?? "";
  if (env.total_cost_usd != null || env.num_turns != null) {
    console.log(`claude usage: cost_usd=${env.total_cost_usd ?? "?"} turns=${env.num_turns ?? "?"}`);
  }
} catch {
  text = raw; // fall back to raw stdout if it wasn't the JSON envelope
}

// --- 3. extract the brief JSON -----------------------------------------------
function extractJson(t) {
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const c = fenced ? fenced[1] : t;
  const s = c.indexOf("{");
  const e = c.lastIndexOf("}");
  if (s === -1 || e <= s) return null;
  try {
    return JSON.parse(c.slice(s, e + 1));
  } catch {
    return null;
  }
}
const brief = extractJson(text);
if (!brief || !brief.headline || !Array.isArray(brief.working)) {
  console.error("could not parse a brief from claude output:\n", text.slice(0, 600));
  process.exit(1);
}

// --- 4. upsert into analytics_briefs -----------------------------------------
const upsertRes = await fetch(
  `${SUPABASE_URL}/rest/v1/analytics_briefs?on_conflict=range`,
  {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify([
      {
        range: RANGE,
        brief,
        model: MODEL,
        generated_at: new Date().toISOString(),
      },
    ]),
  }
);
if (!upsertRes.ok) {
  const body = await upsertRes.text().catch(() => "");
  console.error(`upsert failed: ${upsertRes.status} ${body.slice(0, 300)}`);
  process.exit(1);
}
console.log(`✅ stored brief for range=${RANGE}: "${String(brief.headline).slice(0, 90)}"`);
