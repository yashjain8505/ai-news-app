import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

// The "Open draft → Publish" button on /today goes through here: the row is
// marked opened (so it leaves the list at once) and the user lands on the
// Typefully draft. If they open but do not publish, the reply engine's next
// status sync sees the draft still unpublished and clears opened_at, so it
// comes back. X's rules mean the publish tap itself must be theirs.
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const sb = supabaseService();
  if (!sb) return NextResponse.json({ error: "no service key" }, { status: 500 });
  const { data } = await sb.from("x_replies_ledger").select("draft_url").eq("id", id).maybeSingle();
  if (!data?.draft_url) return NextResponse.json({ error: "not found" }, { status: 404 });
  await sb.from("x_replies_ledger").update({ opened_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.redirect(data.draft_url, 302);
}
