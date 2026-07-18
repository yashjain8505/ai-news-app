import type { Metadata } from "next";
import { isAdmin, adminConfigured } from "@/lib/adminData";
import { AdminShell, AdminLogin } from "../AdminShell";
import { getSimpleAnalytics, normalizeRangeKey } from "@/lib/simpleAnalytics";
import { getStoredBrief } from "@/lib/brief";
import { AnalyticsView } from "./AnalyticsView";

// Reads request cookies + live data on every hit — never cache or prerender.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  if (!(await isAdmin())) {
    return <AdminLogin notConfigured={!adminConfigured} />;
  }

  const rangeKey = normalizeRangeKey((await searchParams).range);
  // The one-line takeaway is the latest 28-day brief's headline (generated
  // out-of-band by the analytics-brief workflow). Everything else is live GA/GSC.
  const [data, brief] = await Promise.all([
    getSimpleAnalytics(rangeKey),
    getStoredBrief(28),
  ]);

  return (
    <AdminShell subtitle="Analytics" active="analytics">
      <AnalyticsView data={data} takeaway={brief?.brief.headline ?? null} />
    </AdminShell>
  );
}
