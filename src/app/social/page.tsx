import type { Metadata } from "next";
import { supabaseService } from "@/lib/supabase-service";
import Review from "./Review";
import type { QueueRow, ReplyRow } from "./Review";

// The Bluesky review + one-click posting screen. Secret-gated (no login), so it
// stays a private operator tool: out of search, off the sitemap, always fresh.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bluesky review",
  robots: { index: false, follow: false },
};

// Minimal "not authorized" shell, styled like the rest of the newspaper.
function Denied() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f3ecda",
        color: "#1b1712",
        fontFamily: "Georgia,'Times New Roman',serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            display: "inline-flex",
            width: 44,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
            background: "#9c2b1d",
            color: "#f3ecda",
            fontSize: 30,
            fontWeight: 700,
            marginBottom: 16,
          }}
        >
          W
        </div>
        <h1 style={{ fontSize: 24, margin: 0 }}>Not authorized</h1>
      </div>
    </div>
  );
}

export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; id?: string }>;
}) {
  const sp = await searchParams;
  const secret = process.env.BLUESKY_REVIEW_SECRET;

  // Strict token gate: unset secret or a mismatch renders nothing but the shell.
  if (!secret || sp.key !== secret) return <Denied />;
  const key = sp.key;

  const svc = supabaseService();
  if (!svc) return <Review queue={null} replies={[]} envKey={key} />;

  // Load one queue row: the given id, else the newest pending one.
  const cols =
    "id, run_date, slot, status, draft_text, candidates, selected_slug, final_text, posted_uri, created_at, posted_at";
  const base = svc.from("bluesky_queue").select(cols);
  const { data: queue } = sp.id
    ? await base.eq("id", sp.id).maybeSingle<QueueRow>()
    : await base
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<QueueRow>();

  if (!queue) return <Review queue={null} replies={[]} envKey={key} />;

  // Its reply targets for the same run_date + slot, oldest first.
  const { data: replies } = await svc
    .from("bluesky_reply_queue")
    .select(
      "id, run_date, slot, target_uri, target_cid, target_author, target_text, target_url, draft_reply, final_reply, status, posted_uri"
    )
    .eq("run_date", queue.run_date)
    .eq("slot", queue.slot)
    .order("created_at", { ascending: true })
    .returns<ReplyRow[]>();

  return <Review queue={queue} replies={replies ?? []} envKey={key} />;
}
