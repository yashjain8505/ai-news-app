import { supabase } from "@/lib/supabase";
import { QuizArticle } from "@/lib/types";
import Onboarding from "@/components/Onboarding";

export const dynamic = "force-dynamic";

export default async function Welcome() {
  const { data } = await supabase
    .from("quiz_articles")
    .select("id,title,url,image_url,summary,tags")
    .eq("is_active", true);

  return <Onboarding articles={(data ?? []) as QuizArticle[]} />;
}
