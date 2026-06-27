import { supabase } from "@/lib/supabase";
import { Item } from "@/lib/types";
import Feed from "@/components/Feed";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { data } = await supabase
    .from("items")
    .select("*")
    .eq("is_active", true)
    .order("section", { ascending: true })
    .order("rank", { ascending: true });

  const items = (data ?? []) as Item[];

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <header className="mb-9">
        <div className="flex items-center gap-2.5">
          <span className="inline-block h-3.5 w-3.5 rounded-sm bg-[#cdff3a]" />
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Signal
          </h1>
        </div>
        <p className="mt-2 text-[15px] text-neutral-400">
          AI news, tools, and ideas, curated to your taste.
        </p>
      </header>
      <Feed items={items} />
      <footer className="mt-14 border-t border-neutral-800 pt-6 text-xs text-neutral-500">
        Rate items 👍 / 👎. Your feedback trains what you see next.
      </footer>
    </main>
  );
}
