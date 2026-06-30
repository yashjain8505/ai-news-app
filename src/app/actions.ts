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
  action: "like" | "less" | "neutral",
  tags: string[]
) {
  const uid = (await cookies()).get(UID)?.value;
  if (!uid) return { ok: false };
  await supabase
    .from("interactions")
    .insert({ user_id: uid, item_id: itemId, action });
  if (action === "neutral") return { ok: true };
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

// Manual edit of the taste mix from the Tune page: this is an explicit baseline,
// so set weights + affinity + the decay-target prior all to the edited mix.
export async function saveMix(weights: Weights) {
  const uid = (await cookies()).get(UID)?.value;
  if (!uid) return { ok: false };
  const norm = normalizeMix(weights);
  await supabase
    .from("user_taste")
    .update({
      weights: norm,
      affinity: norm,
      prior: norm,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", uid);
  return { ok: true };
}

function reactionDelta(a: "like" | "less" | "neutral", n: number) {
  return a === "like" ? 1.2 / n : a === "less" ? -0.6 / n : 0;
}

// Change a past reaction (mis-click / changed mind): apply only the net delta.
export async function reviseReaction(
  itemId: string,
  tags: string[],
  prev: "like" | "less" | "neutral",
  next: "like" | "less" | "neutral"
) {
  const uid = (await cookies()).get(UID)?.value;
  if (!uid) return { ok: false };
  await supabase
    .from("interactions")
    .insert({ user_id: uid, item_id: itemId, action: next });
  const n = tags.length || 1;
  const perTag = reactionDelta(next, n) - reactionDelta(prev, n);
  if (perTag !== 0 && tags.length) await bumpAffinity(uid, tags, perTag);
  return { ok: true };
}

// --- On-demand "fetch fresh news" (free path: triggers the cloud curator) ---
const GH_REPO = "yashjain8505/ai-news-app";
const GH_WORKFLOW = "daily-edition.yml";

export async function requestFreshNews(): Promise<{
  status: "started" | "already-running" | "unconfigured" | "error";
  since: string;
}> {
  const since = new Date().toISOString();
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return { status: "unconfigured", since };
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "signal-app",
  };
  try {
    // Don't stack runs: if a curate is already going, just wait on that one.
    const runsRes = await fetch(
      `https://api.github.com/repos/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/runs?status=in_progress&per_page=1`,
      { headers, cache: "no-store" }
    );
    if (runsRes.ok) {
      const runs = await runsRes.json();
      if ((runs.total_count ?? 0) > 0) return { status: "already-running", since };
    }
    const res = await fetch(
      `https://api.github.com/repos/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ref: "main", inputs: { force: "true" } }),
        cache: "no-store",
      }
    );
    return { status: res.ok ? "started" : "error", since };
  } catch {
    return { status: "error", since };
  }
}

// Newest active item time, so the client can detect when a fresh drop has landed.
export async function latestItemAt(): Promise<string | null> {
  const { data } = await supabase
    .from("items")
    .select("created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.created_at as string | undefined) ?? null;
}
