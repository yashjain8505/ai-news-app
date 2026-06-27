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
const LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
  const todayIdx = (now.getDay() + 6) % 7;
  const days = LABELS.map((label, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() + (i - todayIdx));
    return {
      label,
      big: `${MONTHS[d.getMonth()]} ${d.getDate()}`,
      full: `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
    };
  });

  return (
    <main className="mx-auto max-w-[1120px] px-7 pb-[90px] pt-1">
      <header className="flex items-center justify-between pb-[18px] pt-[22px]">
        <div className="flex items-center gap-2.5">
          <span className="inline-block h-[13px] w-[13px] rounded-[3px] bg-[#cdff3a]" />
          <span className="display text-[22px] font-extrabold tracking-[-0.01em] text-[#f5f3ec]">
            Signal
          </span>
        </div>
        <div className="flex items-center gap-3.5 text-[13px] text-[#807c72]">
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-[7px] w-[7px] rounded-full bg-[#cdff3a]"
              style={{ animation: "sigpulse 2s infinite" }}
            />
            <span>Live</span>
          </span>
          <span className="inline-block h-[13px] w-px bg-[#2a2825]" />
          <span>{name ? `Welcome back, ${name}` : "Tuned to your taste"}</span>
        </div>
      </header>

      <Feed items={items} days={days} todayIdx={todayIdx} />

      <footer className="mt-[72px] flex items-center justify-between border-t border-[#232220] pt-[22px]">
        <span className="serif text-[14px] italic text-[#56534c]">
          The more you read and react, the sharper your feed gets.
        </span>
        <span className="inline-flex items-center gap-2 text-[12px] text-[#56534c]">
          <span className="inline-block h-[11px] w-[11px] rounded-[2px] bg-[#cdff3a]" />
          Signal
        </span>
      </footer>
    </main>
  );
}
