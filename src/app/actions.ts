"use server";

import { getSessionUser, createSupabaseServer } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { supabaseService } from "@/lib/supabase-service";
import {
  scoreItem,
  applyAffinity,
  normalizeMix,
  clickPerTag,
  dwellPerTag,
  type Weights,
} from "@/lib/taste";
import type { Item, Section } from "@/lib/types";

// Sign the current user out (clears the auth cookies) and return to the feed.
export async function signOut() {
  const server = await createSupabaseServer();
  await server.auth.signOut();
  redirect("/");
}

// Permanently delete the current user's account and all their data. Wipes their
// rows via the service-role client (bypasses RLS), removes the auth user, then
// signs out. Irreversible — the UI gates this behind an explicit confirm.
export async function deleteAccount() {
  const user = await getSessionUser();
  if (user) {
    const svc = supabaseService();
    if (svc) {
      await svc.from("interactions").delete().eq("user_id", user.id);
      await svc.from("user_taste").delete().eq("user_id", user.id);
      await svc.from("users").delete().eq("id", user.id);
      await svc.auth.admin.deleteUser(user.id);
    }
    const server = await createSupabaseServer();
    await server.auth.signOut();
  }
  redirect("/");
}

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

export async function completeOnboarding(input: { weights: Weights; techPref?: number; dislikes?: string[] }) {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const userId = user.id;
  const m = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    (m.full_name as string) ||
    (m.name as string) ||
    user.email?.split("@")[0] ||
    "Reader";

  // `users` is a private table — it has an INSERT policy but no SELECT policy, so
  // the public anon key can't write it at all (RLS rejects the insert). Profile
  // creation runs through the service-role client server-side, after the Google
  // session is verified above. Same key the admin DAL uses; never exposed to the
  // browser. user_taste goes through it too so both writes succeed together.
  const svc = supabaseService();
  if (!svc) return { ok: false, error: "service-unavailable" };

  const { error: uErr } = await svc
    .from("users")
    .upsert(
      { id: userId, name, email: user.email ?? null },
      { onConflict: "id", ignoreDuplicates: true }
    );
  if (uErr) return { ok: false, error: uErr.message };

  const { error: tErr } = await svc.from("user_taste").upsert(
    {
      user_id: userId,
      weights: normalizeMix(input.weights),
      prior: input.weights,
      affinity: input.weights,
      sources: [],
      events: 0,
      tech_pref: input.techPref ?? 2,
      dislikes: input.dislikes ?? [],
    },
    { onConflict: "user_id" }
  );
  if (tErr) return { ok: false, error: tErr.message };

  return { ok: true };
}

export async function recordSignal(
  itemId: string,
  action: "like" | "less" | "neutral",
  tags: string[]
) {
  const uid = (await getSessionUser())?.id;
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

// Explicit 1-6 rating from the on-card prompt after a read. Maps to a graded
// affinity nudge (1 = strong dislike ... 6 = strong like) and stores a coarse
// like/less/neutral in the interactions log.
export async function recordRating(
  itemId: string,
  rating: number,
  tags: string[]
) {
  const uid = (await getSessionUser())?.id;
  if (!uid) return { ok: false };
  const r = Math.max(1, Math.min(6, Math.round(rating)));
  const action = r <= 2 ? "less" : r >= 5 ? "like" : "neutral";
  await supabase
    .from("interactions")
    .insert({ user_id: uid, item_id: itemId, action });
  const n = tags.length || 1;
  // Centre at 3.5: 6 -> +1.2/n, 1 -> -1.2/n, 4 -> slight up, 3 -> slight down.
  const perTag = ((r - 3.5) / 2.5) * (1.2 / n);
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
  const uid = (await getSessionUser())?.id;
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
  const uid = (await getSessionUser())?.id;
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
export async function saveMix(weights: Weights, techPref?: number, dislikes?: string[]) {
  const uid = (await getSessionUser())?.id;
  if (!uid) return { ok: false };
  const norm = normalizeMix(weights);
  const patch: Record<string, unknown> = {
    weights: norm,
    affinity: norm,
    prior: norm,
    updated_at: new Date().toISOString(),
  };
  if (typeof techPref === "number") patch.tech_pref = techPref;
  if (dislikes) patch.dislikes = dislikes;
  await supabase.from("user_taste").update(patch).eq("user_id", uid);
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
  const uid = (await getSessionUser())?.id;
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
