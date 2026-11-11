import { requireSuperadminPage } from "@/server/smol";
import { AdminsView } from "@/components/smol/admins-view";

export const metadata = { title: "Admins" };

export default async function AdminsPage() {
  await requireSuperadminPage();
  return <AdminsView />;
}
