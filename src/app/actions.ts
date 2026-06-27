"use server";

import { supabase } from "@/lib/supabase";

export async function recordFeedback(itemId: string, rating: "good" | "bad") {
  const { error } = await supabase
    .from("item_feedback")
    .insert({ item_id: itemId, rating });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
