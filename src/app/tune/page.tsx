import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase-server";
import { supabase } from "@/lib/supabase";
import type { Weights } from "@/lib/taste";
import Tune from "@/components/Tune";

export const dynamic = "force-dynamic";

type Reaction = {
  itemId: string;
  action: "like" | "less" | "neutral";
  title: string;
  source: string | null;
  tags: string[];
};

export default async function TunePage() {
  // Identity comes from the Google session (Supabase Auth) — NOT the old
  // `sig_uid` cookie. Reading the stale cookie looked up the wrong user and
  // rendered every taste bar at 0%.
  const user = await getSessionUser();
  if (!user) redirect("/welcome");
  const uid = user.id;

  const [{ data: taste }, { data: rows }] = await Promise.all([
    supabase.from("user_taste").select("weights, tech_pref, dislikes").eq("user_id", uid).maybeSingle(),
    supabase
      .from("interactions")
      .select("item_id, action, created_at, items(title, source, tags)")
      .eq("user_id", uid)
      .in("action", ["like", "less", "neutral"])
      .order("created_at", { ascending: false })
      .limit(60),
  ]);

  const weights = (taste?.weights as Weights) ?? {};

  const seen = new Set<string>();
  const reactions: Reaction[] = [];
  for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
    const itemId = r.item_id as string;
    if (seen.has(itemId)) continue;
    const itRaw = r.items as
      | { title: string; source: string | null; tags: string[] }
      | { title: string; source: string | null; tags: string[] }[]
      | null;
    const it = Array.isArray(itRaw) ? itRaw[0] : itRaw;
    if (!it) continue;
    seen.add(itemId);
    reactions.push({
      itemId,
      action: r.action as "like" | "less" | "neutral",
      title: it.title,
      source: it.source ?? null,
      tags: (it.tags as string[]) ?? [],
    });
    if (reactions.length >= 25) break;
  }

  return <Tune weights={weights} reactions={reactions} techPref={(taste?.tech_pref as number) ?? 2} dislikes={(taste?.dislikes as string[]) ?? []} />;
}
