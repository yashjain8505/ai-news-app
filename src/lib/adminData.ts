import "server-only";

// SECURITY: this module is the ONLY place the Supabase service-role key and the
// ADMIN_SECRET are read. The `server-only` import above makes any attempt to
// import this file from a Client Component a build error, so the service key can
// never be bundled to the browser. Treat this as the admin Data Access Layer:
// every read + the auth gate live here; the thin `"use server"` actions in
// src/app/admin/actions.ts delegate to it.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { normalizeMix, TAGS, type Weights } from "@/lib/taste";

// Same project URL as the public client (src/lib/supabase.ts), but paired with
// the SERVICE-ROLE key so these reads bypass RLS. The URL is not a secret.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://zrjbzowohsgjbrhsldfi.supabase.co";

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

export const ADMIN_COOKIE = "wortins_admin";

// True only when the server has the secrets it needs to expose real data. When
// false, every data function below returns empty results instead of crashing —
// so the build and an un-provisioned preview deploy stay healthy.
export const adminConfigured = Boolean(SERVICE_KEY);

// Lazy singleton service-role client. Never constructed at module load so a
// missing key can't throw during the build.
let _svc: SupabaseClient | null = null;
function svc(): SupabaseClient | null {
  if (!SERVICE_KEY) return null;
  if (!_svc) {
    _svc = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _svc;
}

// --- auth gate ---------------------------------------------------------------

// The cookie carries an HMAC of the secret (keyed by the secret itself), never
// the secret in plaintext, so a leaked cookie doesn't hand over ADMIN_SECRET.
export function adminToken(secret: string): string {
  return createHmac("sha256", secret).update("wortins-admin-v1").digest("hex");
}

// Constant-time string compare that also tolerates length mismatch without
// leaking it through an early return.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // Still run a compare against a same-length buffer to avoid timing signal.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

// Does the submitted password match the configured secret?
export function checkPassword(candidate: string | undefined | null): boolean {
  if (!ADMIN_SECRET || !candidate) return false;
  return safeEqual(candidate, ADMIN_SECRET);
}

// Is the current request an authenticated admin? Reads the httpOnly cookie
// server-side and compares (constant-time) to the expected HMAC. If ADMIN_SECRET
// is unset we fail closed — no cookie value can ever satisfy the gate.
export async function isAdmin(): Promise<boolean> {
  if (!ADMIN_SECRET) return false;
  const jar = await cookies();
  const val = jar.get(ADMIN_COOKIE)?.value;
  if (!val) return false;
  return safeEqual(val, adminToken(ADMIN_SECRET));
}

// --- shapes returned to the (server-rendered) views --------------------------

export type AdminUserRow = {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string | null;
  lastActive: string | null;
  interactions: number;
  topTags: { tag: string; pct: number }[];
};

export type AdminMetrics = {
  totalUsers: number;
  activeThisWeek: number;
  avgReadsPerUser: number;
};

export type AdminOverview = {
  configured: boolean;
  metrics: AdminMetrics;
  users: AdminUserRow[];
};

const EMPTY_OVERVIEW: AdminOverview = {
  configured: false,
  metrics: { totalUsers: 0, activeThisWeek: 0, avgReadsPerUser: 0 },
  users: [],
};

// Top few taste tags for a user, derived the same way the app derives the
// displayed mix: normalizeMix(affinity ?? weights).
function topTags(
  affinity: Weights | null,
  weights: Weights | null,
  limit = 3
): { tag: string; pct: number }[] {
  const mix = normalizeMix(affinity ?? weights ?? null);
  return TAGS.map((tag) => ({ tag, pct: mix[tag] ?? 0 }))
    .filter((t) => t.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, limit);
}

// --- overview (metrics + users table) ----------------------------------------

export async function getAdminOverview(): Promise<AdminOverview> {
  const db = svc();
  if (!db) return EMPTY_OVERVIEW;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [usersRes, tasteRes, interRes] = await Promise.all([
    db
      .from("users")
      .select("id, name, email, created_at")
      .order("created_at", { ascending: false }),
    db.from("user_taste").select("user_id, weights, affinity"),
    db.from("interactions").select("user_id, created_at"),
  ]);

  const users = usersRes.data ?? [];
  const taste = tasteRes.data ?? [];
  const interactions = interRes.data ?? [];

  // Per-user rollups from the interactions table.
  const countByUser = new Map<string, number>();
  const lastByUser = new Map<string, string>();
  const activeUsers = new Set<string>();
  for (const row of interactions as Array<{
    user_id: string | null;
    created_at: string | null;
  }>) {
    const uid = row.user_id;
    if (!uid) continue;
    countByUser.set(uid, (countByUser.get(uid) ?? 0) + 1);
    const ts = row.created_at ?? null;
    if (ts) {
      const prev = lastByUser.get(uid);
      if (!prev || ts > prev) lastByUser.set(uid, ts);
      if (ts >= weekAgo) activeUsers.add(uid);
    }
  }

  const tasteByUser = new Map<
    string,
    { weights: Weights | null; affinity: Weights | null }
  >();
  for (const t of taste as Array<{
    user_id: string | null;
    weights: Weights | null;
    affinity: Weights | null;
  }>) {
    if (t.user_id)
      tasteByUser.set(t.user_id, {
        weights: t.weights ?? null,
        affinity: t.affinity ?? null,
      });
  }

  const rows: AdminUserRow[] = (
    users as Array<{
      id: string;
      name: string | null;
      email: string | null;
      created_at: string | null;
    }>
  ).map((u) => {
    const t = tasteByUser.get(u.id);
    return {
      id: u.id,
      name: u.name ?? null,
      email: u.email ?? null,
      createdAt: u.created_at ?? null,
      lastActive: lastByUser.get(u.id) ?? null,
      interactions: countByUser.get(u.id) ?? 0,
      topTags: topTags(t?.affinity ?? null, t?.weights ?? null),
    };
  });

  const totalUsers = rows.length;
  const totalInteractions = interactions.length;
  const avgReadsPerUser =
    totalUsers > 0 ? Math.round((totalInteractions / totalUsers) * 10) / 10 : 0;

  return {
    configured: true,
    metrics: {
      totalUsers,
      activeThisWeek: activeUsers.size,
      avgReadsPerUser,
    },
    users: rows,
  };
}

// --- single-user drill-in ----------------------------------------------------

export type AdminInteraction = {
  id: string;
  action: string | null;
  dwellMs: number | null;
  createdAt: string | null;
  itemTitle: string | null;
};

export type AdminFeedback = {
  id: string;
  rating: number | null;
  createdAt: string | null;
  itemTitle: string | null;
};

export type AdminTasteResponse = {
  id: string;
  round: number | null;
  chosenId: string | null;
  chosenTitle: string | null;
  shownIds: string[];
  createdAt: string | null;
};

export type AdminUserDetail = {
  configured: boolean;
  found: boolean;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    createdAt: string | null;
  } | null;
  mix: { tag: string; pct: number }[];
  interactions: AdminInteraction[];
  feedback: AdminFeedback[];
  responses: AdminTasteResponse[];
};

const EMPTY_DETAIL: AdminUserDetail = {
  configured: false,
  found: false,
  user: null,
  mix: [],
  interactions: [],
  feedback: [],
  responses: [],
};

// items.title lookup for a set of ids, resolved with the service client.
async function titlesFor(
  db: SupabaseClient,
  ids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data } = await db.from("items").select("id, title").in("id", unique);
  for (const it of (data ?? []) as Array<{ id: string; title: string | null }>) {
    map.set(it.id, it.title ?? "");
  }
  return map;
}

export async function getAdminUserDetail(
  userId: string
): Promise<AdminUserDetail> {
  const db = svc();
  if (!db) return EMPTY_DETAIL;

  const [userRes, tasteRes, interRes, feedbackRes, respRes] = await Promise.all([
    db
      .from("users")
      .select("id, name, email, created_at")
      .eq("id", userId)
      .maybeSingle(),
    db
      .from("user_taste")
      .select("weights, affinity")
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("interactions")
      .select("id, item_id, action, dwell_ms, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(300),
    db
      .from("item_feedback")
      .select("id, item_id, rating, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(300),
    db
      .from("taste_responses")
      .select("id, round, chosen_id, shown_ids, created_at")
      .eq("user_id", userId)
      .order("round", { ascending: true })
      .limit(100),
  ]);

  const user = userRes.data as AdminUserDetail["user"];
  if (!user) {
    return { ...EMPTY_DETAIL, configured: true };
  }

  const taste = tasteRes.data as {
    weights: Weights | null;
    affinity: Weights | null;
  } | null;
  const mixObj = normalizeMix(taste?.affinity ?? taste?.weights ?? null);
  const mix = TAGS.map((tag) => ({ tag, pct: mixObj[tag] ?? 0 })).sort(
    (a, b) => b.pct - a.pct
  );

  const interRows = (interRes.data ?? []) as Array<{
    id: string;
    item_id: string | null;
    action: string | null;
    dwell_ms: number | null;
    created_at: string | null;
  }>;
  const feedbackRows = (feedbackRes.data ?? []) as Array<{
    id: string;
    item_id: string | null;
    rating: number | null;
    created_at: string | null;
  }>;
  const respRows = (respRes.data ?? []) as Array<{
    id: string;
    round: number | null;
    chosen_id: string | null;
    shown_ids: string[] | null;
    created_at: string | null;
  }>;

  // Resolve every referenced item title in one query.
  const idsToResolve: string[] = [];
  for (const r of interRows) if (r.item_id) idsToResolve.push(r.item_id);
  for (const r of feedbackRows) if (r.item_id) idsToResolve.push(r.item_id);
  for (const r of respRows) if (r.chosen_id) idsToResolve.push(r.chosen_id);
  const titles = await titlesFor(db, idsToResolve);

  const interactions: AdminInteraction[] = interRows.map((r) => ({
    id: r.id,
    action: r.action ?? null,
    dwellMs: r.dwell_ms ?? null,
    createdAt: r.created_at ?? null,
    itemTitle: r.item_id ? titles.get(r.item_id) ?? null : null,
  }));

  const feedback: AdminFeedback[] = feedbackRows.map((r) => ({
    id: r.id,
    rating: r.rating ?? null,
    createdAt: r.created_at ?? null,
    itemTitle: r.item_id ? titles.get(r.item_id) ?? null : null,
  }));

  const responses: AdminTasteResponse[] = respRows.map((r) => ({
    id: r.id,
    round: r.round ?? null,
    chosenId: r.chosen_id ?? null,
    chosenTitle: r.chosen_id ? titles.get(r.chosen_id) ?? null : null,
    shownIds: (r.shown_ids ?? []) as string[],
    createdAt: r.created_at ?? null,
  }));

  return {
    configured: true,
    found: true,
    user,
    mix,
    interactions,
    feedback,
    responses,
  };
}

// --- destructive: cascade-delete a user --------------------------------------

// Deletes the user and every row that references them, in FK-safe order
// (children first, users last). Callers MUST verify isAdmin() before invoking
// this — see src/app/admin/actions.ts. Uses the service-role client so it works
// regardless of RLS.
export async function deleteUserCascade(
  userId: string
): Promise<{ ok: boolean; reason?: string }> {
  const db = svc();
  if (!db) return { ok: false, reason: "not-configured" };
  if (!userId) return { ok: false, reason: "missing-id" };

  // Child tables first. item_feedback is keyed by user_id per the schema.
  const steps: Array<{ table: string; column: string }> = [
    { table: "interactions", column: "user_id" },
    { table: "taste_responses", column: "user_id" },
    { table: "item_feedback", column: "user_id" },
    { table: "user_taste", column: "user_id" },
    { table: "users", column: "id" },
  ];

  for (const step of steps) {
    const { error } = await db.from(step.table).delete().eq(step.column, userId);
    if (error) {
      return { ok: false, reason: `${step.table}: ${error.message}` };
    }
  }
  return { ok: true };
}
