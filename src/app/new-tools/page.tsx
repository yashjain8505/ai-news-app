import FeedPage, { sectionMetadata } from "@/components/FeedPage";

export const dynamic = "force-dynamic";
export const metadata = sectionMetadata("tools");

export default function Page() {
  return <FeedPage section="tools" />;
}
