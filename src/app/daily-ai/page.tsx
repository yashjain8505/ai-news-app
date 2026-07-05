import SectionReader, { sectionMetadata } from "@/components/SectionReader";

export const revalidate = 1800; // 30 min ISR
export const metadata = sectionMetadata("daily");

export default function Page() {
  return <SectionReader section="daily" />;
}
