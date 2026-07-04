"use server";

// Thin server actions for the admin console. Each mutation re-checks
// authorization inside itself, because Server Actions are reachable via direct
// POST — not just through the rendered UI. All secret handling + DB access lives
// in the server-only DAL (src/lib/adminData.ts).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  ADMIN_COOKIE,
  adminToken,
  checkPassword,
  isAdmin,
  deleteUserCascade,
} from "@/lib/adminData";

const YEAR = 60 * 60 * 24 * 365;

// Log in: compare the submitted password to ADMIN_SECRET (constant-time, inside
// the DAL). On success, store an httpOnly + secure + sameSite=lax cookie holding
// an HMAC of the secret — never the secret itself.
export async function login(formData: FormData): Promise<void> {
  const password = formData.get("password");
  const candidate = typeof password === "string" ? password : "";
  if (!checkPassword(candidate)) {
    redirect("/admin?e=1");
  }
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, adminToken(candidate), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: YEAR,
  });
  redirect("/admin");
}

// Log out: clear the gate cookie.
export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  redirect("/admin");
}

// Delete a user and cascade their rows. Gated: re-verify admin on every call and
// bail if the confirmation field wasn't set by the UI.
export async function deleteUser(formData: FormData): Promise<void> {
  if (!(await isAdmin())) {
    redirect("/admin");
  }
  const id = formData.get("id");
  const confirm = formData.get("confirm");
  if (typeof id !== "string" || !id || confirm !== "DELETE") {
    return;
  }
  const res = await deleteUserCascade(id);
  if (!res.ok) {
    redirect(`/admin/user/${id}?e=${encodeURIComponent(res.reason ?? "error")}`);
  }
  revalidatePath("/admin");
  redirect("/admin?deleted=1");
}
