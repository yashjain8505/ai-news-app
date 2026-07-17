import type { NextRequest } from "next/server";
import { supabaseService } from "@/lib/supabase-service";

// Human-in-the-loop "Approve & schedule" endpoint for the /social review screen.
// Instead of posting one story now, the operator approves the top ~3 candidate
// posts. Each lands as a `bluesky_scheduled` row spaced 1 hour apart (now, +1h,
// +2h); the /api/bluesky/drip cron posts each once it comes due, linking to that
// story's own page. Guarded by BLUESKY_REVIEW_SECRET so only the operator posts.

export const dynamic = "force-dynamic";

const MAX_CHARS = 300; // Bluesky post limit (graphemes; we stay under conservatively)
const MAX_POSTS = 3;
const HOUR_MS = 3600 * 1000;

type ScheduleBody = {
  key?: unknown;
  queueId?: unknown;
  posts?: unknown;
};

type ScheduledInsert = {
  run_date: string;
  slot: string;
  story_slug: string;
  text: string;
  scheduled_for: string;
  status: "pending";
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: ScheduleBody;
  try {
    body = (await req.json()) as ScheduleBody;
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const secret = process.env.BLUESKY_REVIEW_SECRET;
  if (!secret || body.key !== secret) {
    return json({ ok: false, error: "Not authorized." }, 401);
  }

  const queueId = typeof body.queueId === "string" ? body.queueId : "";
  if (!queueId) return json({ ok: false, error: "Missing queueId." }, 400);

  // Validate posts: non-empty, at most 3, each with a slug and 1..300-char text.
  if (!Array.isArray(body.posts) || body.posts.length === 0) {
    return json({ ok: false, error: "No posts to schedule." }, 400);
  }
  if (body.posts.length > MAX_POSTS) {
    return json(
      { ok: false, error: `At most ${MAX_POSTS} posts can be scheduled.` },
      400
    );
  }

  const raw = body.posts as Array<{ slug?: unknown; text?: unknown }>;
  const clean: { slug: string; text: string }[] = [];
  for (const p of raw) {
    const slug = p && typeof p.slug === "string" ? p.slug.trim() : "";
    const text = p && typeof p.text === "string" ? p.text.trim() : "";
    if (!slug) return json({ ok: false, error: "A post is missing its story slug." }, 400);
    if (!text) return json({ ok: false, error: "A post has empty text." }, 400);
    if (text.length > MAX_CHARS) {
      return json(
        { ok: false, error: `A post is ${text.length} chars, over the ${MAX_CHARS} limit.` },
        400
      );
    }
    clean.push({ slug, text });
  }

  const svc = supabaseService();
  if (!svc) return json({ ok: false, error: "Database is not configured." }, 500);

  // Load the queue row for run_date + slot (and to confirm it exists).
  const { data: row, error: rowErr } = await svc
    .from("bluesky_queue")
    .select("id, run_date, slot")
    .eq("id", queueId)
    .maybeSingle<{ id: string; run_date: string; slot: string }>();
  if (rowErr) return json({ ok: false, error: "Could not load the queue row." }, 500);
  if (!row) return json({ ok: false, error: "Queue row not found." }, 404);

  // One scheduled row per post, in order: now, +1h, +2h. Snapshot the base time
  // so all three derive from the same instant.
  const base = Date.now();
  const rows: ScheduledInsert[] = clean.map((p, i) => ({
    run_date: row.run_date,
    slot: row.slot,
    story_slug: p.slug,
    text: p.text,
    scheduled_for: new Date(base + i * HOUR_MS).toISOString(),
    status: "pending",
  }));

  const { error: insErr } = await svc.from("bluesky_scheduled").insert(rows);
  if (insErr) {
    return json(
      { ok: false, error: `Could not schedule the posts: ${insErr.message}` },
      500
    );
  }

  // The queue row has now been actioned; mark it posted so it stops surfacing as
  // pending and the review screen shows the already-scheduled state on revisit.
  // Best-effort: the schedule rows already landed, so a hiccup here is not fatal.
  await svc.from("bluesky_queue").update({ status: "posted" }).eq("id", queueId);

  const scheduled = rows.map((r) => ({ scheduled_for: r.scheduled_for }));
  return json({ ok: true, scheduled, count: scheduled.length });
}
