import FeedPage, { sectionMetadata } from "@/components/FeedPage";

export const dynamic = "force-dynamic";
export const metadata = sectionMetadata("funding");

export default function Page() {
  return <FeedPage section="funding" />;
}
