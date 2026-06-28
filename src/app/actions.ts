"use server";

import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import {
  scoreItem,
  applyAffinity,
  normalizeMix,
  clickPerTag,
  dwellPerTag,
  type Weights,
} from "@/lib/taste";
import type { Item, Section } from "@/lib/types";

async function bumpAffinity(uid: string, tags: string[], perTag: number) {
  const { data } = await supabase
    .from("user_taste")
    .select("affinity, prior, events")
    .eq("user_id", uid)
    .maybeSingle();
  if (!data) return;
  const affinity = applyAffinity(
    data.affinity as Weights,
    data.prior as Weights,
    tags,
    perTag
  );
  await supabase
    .from("user_taste")
    .update({
      affinity,
      weights: normalizeMix(affinity),
      events: (data.events ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", uid);
}

const UID = "sig_uid";
const UNAME = "sig_name";
const YEAR = 60 * 60 * 24 * 365;

export async function completeOnboarding(input: {
  name: string;
  email: string;
  weights: Weights;
}) {
  const userId = crypto.randomUUID();
  await supabase
    .from("users")
    .insert({ id: userId, name: input.name, email: input.email });
  await supabase.from("user_taste").insert({
    user_id: userId,
    weights: normalizeMix(input.weights),
    prior: input.weights,
    affinity: input.weights,
    sources: [],
    events: 0,
  });

  const jar = await cookies();
  const opts = { path: "/", maxAge: YEAR, sameSite: "lax" as const };
  jar.set(UID, userId, opts);
  jar.set(UNAME, input.name, opts);
  return { ok: true };
}

export async function recordSignal(
  itemId: string,
  action: "like" | "less",
  tags: string[]
) {
  const uid = (await cookies()).get(UID)?.value;
  if (!uid) return { ok: false };
  await supabase
    .from("interactions")
    .insert({ user_id: uid, item_id: itemId, action });
  const n = tags.length || 1;
  const perTag = action === "like" ? 1.2 / n : -0.6 / n;
  if (tags.length) await bumpAffinity(uid, tags, perTag);
  return { ok: true };
}

export async function recordEngagement(
  itemId: string,
  tags: string[],
  kind: "click" | "dwell",
  rank: number,
  dwellMs?: number,
  mobile?: boolean
) {
  const uid = (await cookies()).get(UID)?.value;
  if (!uid) return { ok: false };
  await supabase
    .from("interactions")
    .insert({ user_id: uid, item_id: itemId, action: kind, dwell_ms: dwellMs ?? null });

  const n = tags.length || 1;
  const perTag =
    kind === "click"
      ? clickPerTag(rank, n)
      : dwellPerTag(dwellMs ?? 0, rank, n, !!mobile);
  if (perTag !== null && tags.length) await bumpAffinity(uid, tags, perTag);
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
          .select("weights, sources")
          .eq("user_id", uid)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const weights = (tasteRes.data?.weights as Weights) ?? null;
  const sources = (tasteRes.data?.sources as string[]) ?? null;
  return ((itemsRes.data ?? []) as Item[])
    .map((it) => ({ it, s: scoreItem(it.tags, weights, it.source, sources) }))
    .sort((a, b) => b.s - a.s || a.it.rank - b.it.rank)
    .map((x) => x.it);
}
