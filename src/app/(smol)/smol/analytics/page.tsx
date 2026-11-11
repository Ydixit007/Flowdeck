import { requireSuperadminPage } from "@/server/smol";
import { SmolAnalyticsView } from "@/components/smol/smol-analytics";

export const metadata = { title: "Analytics" };

export default async function SmolAnalyticsPage() {
  await requireSuperadminPage();
  return <SmolAnalyticsView />;
}
