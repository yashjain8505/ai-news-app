"use server";

import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { scoreItem, type Weights } from "@/lib/taste";
import type { Item, Section } from "@/lib/types";

const UID = "sig_uid";
const UNAME = "sig_name";
const YEAR = 60 * 60 * 24 * 365;

type Round = {
  chosenId: string;
  shownIds: string[];
  chosenTags: string[];
  otherTags: string[][];
};

export async function completeOnboarding(input: {
  name: string;
  email: string;
  rounds: Round[];
}) {
  const userId = crypto.randomUUID();
  await supabase
    .from("users")
    .insert({ id: userId, name: input.name, email: input.email });

  const weights: Weights = {};
  const responses = input.rounds.map((r, i) => {
    for (const t of r.chosenTags) weights[t] = (weights[t] ?? 0) + 1;
    for (const arr of r.otherTags)
      for (const t of arr) weights[t] = (weights[t] ?? 0) - 0.2;
    return {
      user_id: userId,
      round: i + 1,
      chosen_id: r.chosenId,
      shown_ids: r.shownIds,
    };
  });
  if (responses.length)
    await supabase.from("taste_responses").insert(responses);
  await supabase.from("user_taste").insert({ user_id: userId, weights });

  const jar = await cookies();
  const opts = { path: "/", maxAge: YEAR, sameSite: "lax" as const };
  jar.set(UID, userId, opts);
  jar.set(UNAME, input.name, opts);
  return { ok: true };
}

export async function recordSignal(
  itemId: string,
  action: "like" | "less" | "click",
  tags: string[]
) {
  const uid = (await cookies()).get(UID)?.value;
  if (!uid) return { ok: false };

  await supabase
    .from("interactions")
    .insert({ user_id: uid, item_id: itemId, action });

  if (action === "click") return { ok: true };

  const delta = action === "like" ? 1 : -1;
  const { data } = await supabase
    .from("user_taste")
    .select("weights")
    .eq("user_id", uid)
    .maybeSingle();
  const w: Weights = (data?.weights as Weights) ?? {};
  for (const t of tags) w[t] = (w[t] ?? 0) + delta;
  await supabase
    .from("user_taste")
    .upsert({ user_id: uid, weights: w, updated_at: new Date().toISOString() });
  return { ok: true };
}

export async function getSectionItems(
  section: Section,
  dateISO: string
): Promise<Item[]> {
  const uid = (await cookies()).get(UID)?.value;
  const [itemsRes, tasteRes] = await Promise.all([
    supabase
      .from("items")
      .select("*")
      .eq("is_active", true)
      .eq("edition_date", dateISO)
      .eq("section", section),
    uid
      ? supabase
          .from("user_taste")
          .select("weights")
          .eq("user_id", uid)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const weights = (tasteRes.data?.weights as Weights) ?? null;
  return ((itemsRes.data ?? []) as Item[])
    .map((it) => ({ it, s: scoreItem(it.tags, weights) }))
    .sort((a, b) => b.s - a.s || a.it.rank - b.it.rank)
    .map((x) => x.it);
}
