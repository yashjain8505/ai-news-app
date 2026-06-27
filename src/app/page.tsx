import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Item } from "@/lib/types";
import { scoreItem, type Weights } from "@/lib/taste";
import Feed from "@/components/Feed";

export const dynamic = "force-dynamic";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function Home() {
  const jar = await cookies();
  const uid = jar.get("sig_uid")?.value;
  if (!uid) redirect("/welcome");
  const name = jar.get("sig_name")?.value;

  const [{ data: itemsData }, { data: tasteData }] = await Promise.all([
    supabase.from("items").select("*").eq("is_active", true),
    supabase
      .from("user_taste")
      .select("weights")
      .eq("user_id", uid)
      .maybeSingle(),
  ]);

  const weights = (tasteData?.weights as Weights) ?? null;
  const items = ((itemsData ?? []) as Item[])
    .map((it) => ({ it, s: scoreItem(it.tags, weights) }))
    .sort((a, b) => b.s - a.s || a.it.rank - b.it.rank)
    .map((x) => x.it);

  const now = new Date();
  const bigDate = `${MONTHS[now.getMonth()]} ${now.getDate()}`;
  const fullDate = `${bigDate}, ${now.getFullYear()}`;
  const today = WK[now.getDay()];

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <header className="mb-9 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="inline-block h-3.5 w-3.5 rounded-sm bg-[#cdff3a]" />
          <h1 className="display text-2xl font-extrabold tracking-tight text-white">
            Signal
          </h1>
        </div>
        <p className="text-sm text-neutral-500">
          {name ? `Welcome back, ${name}` : "Tuned to your taste"}
        </p>
      </header>

      <Feed items={items} bigDate={bigDate} fullDate={fullDate} today={today} />

      <footer className="mt-14 border-t border-neutral-800 pt-6 text-xs text-neutral-500">
        The more you read and react, the sharper your feed gets.
      </footer>
    </main>
  );
}
