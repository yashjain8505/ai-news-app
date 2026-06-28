import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Item } from "@/lib/types";
import { scoreItem, type Weights } from "@/lib/taste";
import { timeAgo } from "@/lib/time";
import Feed from "@/components/Feed";

export const dynamic = "force-dynamic";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MON3 = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];
const FULL = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];
const LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function Home() {
  const jar = await cookies();
  const uid = jar.get("sig_uid")?.value;
  if (!uid) redirect("/welcome");
  const name = jar.get("sig_name")?.value ?? null;
  const initialMode = jar.get("sig_theme")?.value === "dark" ? "dark" : "light";

  const [{ data: itemsData }, { data: tasteData }] = await Promise.all([
    supabase.from("items").select("*").eq("is_active", true),
    supabase
      .from("user_taste")
      .select("weights, sources")
      .eq("user_id", uid)
      .maybeSingle(),
  ]);

  const weights = (tasteData?.weights as Weights) ?? null;
  const sources = (tasteData?.sources as string[]) ?? null;
  const items = ((itemsData ?? []) as Item[])
    .map((it) => ({ it, s: scoreItem(it.tags, weights, it.source, sources) }))
    .sort((a, b) => b.s - a.s || a.it.rank - b.it.rank)
    .map((x) => x.it);

  const now = Date.now();
  const today = new Date(now);
  const todayIdx = (today.getDay() + 6) % 7;
  const days = LABELS.map((label, i) => {
    const dd = new Date(now);
    dd.setDate(today.getDate() + (i - todayIdx));
    const iso = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}-${String(dd.getDate()).padStart(2, "0")}`;
    return {
      label,
      date: iso,
      big: `${MONTHS[dd.getMonth()]} ${dd.getDate()}`,
      full: `${FULL[i]}, ${MONTHS[dd.getMonth()]} ${dd.getDate()}, ${dd.getFullYear()}`,
    };
  });

  const newest = items.reduce<string | null>(
    (m, it) => (it.published_at && (!m || it.published_at > m) ? it.published_at : m),
    null
  );
  const updatedAgo = timeAgo(newest, now);
  const stampDate = `${MON3[today.getMonth()]} ${today.getDate()} ·${String(today.getFullYear()).slice(2)}`;
  const editionNo = Math.max(
    1,
    Math.floor((now - Date.parse("2025-05-12T00:00:00Z")) / 86400000)
  );

  return (
    <Feed
      items={items}
      days={days}
      todayIdx={todayIdx}
      now={now}
      name={name}
      updatedAgo={updatedAgo}
      stampDate={stampDate}
      editionNo={editionNo}
      initialMode={initialMode}
    />
  );
}
