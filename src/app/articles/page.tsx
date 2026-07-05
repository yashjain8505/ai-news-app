import FeedPage, { sectionMetadata } from "@/components/FeedPage";

export const dynamic = "force-dynamic";
export const metadata = sectionMetadata("articles");

export default function Page() {
  return <FeedPage section="articles" />;
}
