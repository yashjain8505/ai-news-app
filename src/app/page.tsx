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
    <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
      <header className="mb-8">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-500" />
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            Signal
          </h1>
        </div>
        <p className="mt-2 text-[15px] text-neutral-500">
          AI news, tools, and ideas — curated to your taste.
        </p>
      </header>
      <Feed items={items} />
      <footer className="mt-12 border-t border-neutral-200 pt-6 text-xs text-neutral-400">
        Rate items 👍 / 👎 — your feedback trains what you see next.
      </footer>
    </main>
  );
}
