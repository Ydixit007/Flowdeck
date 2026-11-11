import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SmolOverview } from "@/components/smol/smol-overview";

export const metadata = { title: "Overview" };

export default async function SmolOverviewPage() {
  // Marketing's home is the sellers list; the overview is all GMV and billing.
  if ((await getCurrentUser())?.role !== "superadmin") redirect("/smol/stores");
  return <SmolOverview />;
}
