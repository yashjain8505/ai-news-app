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
  skipPerTag,
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

export async function completeOnboarding(input: {
  weights: Weights;
  techPref?: number;
  dislikes?: string[];
  profile?: { fullName?: string; email?: string; phone?: string; referralSource?: string };
}) {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const userId = user.id;
  const m = (user.user_metadata ?? {}) as Record<string, unknown>;
  const googleName =
    (m.full_name as string) ||
    (m.name as string) ||
    user.email?.split("@")[0] ||
    "Reader";
  // Profile fields from onboarding win over the Google defaults; fall back to
  // them (and to the session email) so the row is always populated.
  const p = input.profile ?? {};
  const name = p.fullName?.trim() || googleName;
  const email = p.email?.trim() || user.email || null;
  const phone = p.phone?.trim() || null;
  const referralSource = p.referralSource?.trim() || null;

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
      { id: userId, name, email, phone, referral_source: referralSource },
      { onConflict: "id" }
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

// A feed click: a positive vote for the opened story's topics, plus a small
// negative for every story shown ABOVE it that the reader scrolled past without
// clicking (seen, not chosen). This replaces time-on-article (dwell), which was
// noise because reading speed varies person to person. One read + one write.
// Skips are NOT logged as interactions rows (the action CHECK only permits
// click/dwell/like/less/neutral); they only nudge the affinity vector.
export async function recordFeedClick(
  clickedId: string,
  clickedTags: string[],
  clickedRank: number,
  skippedTags: string[]
) {
  const uid = (await getSessionUser())?.id;
  if (!uid) return { ok: false };
  await supabase
    .from("interactions")
    .insert({ user_id: uid, item_id: clickedId, action: "click" });

  const { data } = await supabase
    .from("user_taste")
    .select("affinity, prior, events")
    .eq("user_id", uid)
    .maybeSingle();
  if (!data) return { ok: true };

  let affinity = data.affinity as Weights;
  const prior = data.prior as Weights;
  if (clickedTags.length) {
    affinity = applyAffinity(affinity, prior, clickedTags, clickPerTag(clickedRank, clickedTags.length));
  }
  if (skippedTags.length) {
    affinity = applyAffinity(affinity, prior, skippedTags, skipPerTag(skippedTags.length));
  }
  await supabase
    .from("user_taste")
    .update({
      affinity,
      weights: normalizeMix(affinity),
      events: (data.events ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", uid);
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

// --- Newsletter (the Wortins Daily) -----------------------------------------
const NL_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Capture a newsletter signup into our own private `subscribers` table via the
// service-role client (RLS denies the anon key any access to the list). This is
// deliberately provider-agnostic: the emails are ours, so we can sync them to
// Substack / Resend / Buttondown later without re-collecting anyone. Idempotent —
// a repeat address is a silent no-op, not an error, so the UI can always say "in".
export async function subscribeNewsletter(
  emailRaw: string
): Promise<{ ok: boolean; error?: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!NL_EMAIL_RE.test(email)) return { ok: false, error: "invalid" };
  const svc = supabaseService();
  if (!svc) return { ok: false, error: "unavailable" };

  // Already subscribed -> silent success, and don't re-send the welcome.
  const { data: existing } = await svc
    .from("subscribers")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  if (existing) return { ok: true };

  // New subscriber. Insert and grab the token so the welcome email carries a
  // working one-click unsubscribe (same as the daily send).
  const { data: row, error } = await svc
    .from("subscribers")
    .insert({ email, source: "site" })
    .select("unsubscribe_token")
    .maybeSingle();
  if (error) {
    // Unique-violation race (inserted between the check and here) is still fine.
    if ((error as { code?: string }).code === "23505") return { ok: true };
    return { ok: false, error: error.message };
  }

  // Instant welcome so they "start receiving" the moment they subscribe; the
  // daily edition follows each morning. Best-effort: a mail failure never fails
  // the signup, and it no-ops until RESEND_KEY is set in the app's env.
  await sendWelcomeEmail(email, row?.unsubscribe_token as string | undefined);
  return { ok: true };
}

async function sendWelcomeEmail(email: string, token?: string) {
  const key = process.env.RESEND_KEY;
  if (!key) return;
  const site = "https://www.wortins.com";
  const unsub = token ? `${site}/api/unsubscribe?token=${token}` : site;
  const html = `<!doctype html><html><body style="margin:0;background:#f3ecda;padding:28px 0;font-family:Georgia,'Times New Roman',serif;color:#1b1712;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#f3ecda;border:1px solid #1b1712;">
      <tr><td style="padding:28px 30px 24px;">
        <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#9c2b1d;">The Wortins Daily</div>
        <h1 style="font-size:26px;line-height:1.15;margin:10px 0 0;color:#1b1712;">You&#8217;re in.</h1>
        <p style="font-size:16px;line-height:1.6;color:#4a4338;margin:14px 0 0;">Thanks for subscribing. Every morning you&#8217;ll get the most interesting AI news, curated and summarized, in a five-minute read.</p>
        <p style="font-size:16px;line-height:1.6;color:#4a4338;margin:14px 0 0;">Your first full edition lands tomorrow morning. Today&#8217;s is already live:</p>
        <p style="margin:22px 0 0;"><a href="${site}" style="display:inline-block;background:#9c2b1d;color:#f3ecda;text-decoration:none;font-family:'Courier New',monospace;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;padding:12px 22px;">Read today&#8217;s edition</a></p>
        <div style="border-top:1px solid #c9bda4;margin-top:26px;padding-top:14px;font-family:'Courier New',monospace;font-size:11px;color:#938a76;">Wortins, wortins.com &#183; <a href="${unsub}" style="color:#938a76;">Unsubscribe</a></div>
      </td></tr>
    </table>
  </td></tr></table>
  </body></html>`;
  const text = `You're in.\n\nThanks for subscribing to the Wortins Daily. Every morning you'll get the most interesting AI news, curated and summarized, in a five-minute read.\n\nToday's edition: ${site}\n\nUnsubscribe: ${unsub}`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Wortins Daily <daily@wortins.com>",
        to: [email],
        reply_to: "hello@wortins.com",
        subject: "You’re subscribed to the Wortins Daily",
        html,
        text,
        headers: token
          ? { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
          : undefined,
      }),
    });
  } catch {
    // best-effort; the daily send still reaches them
  }
}
