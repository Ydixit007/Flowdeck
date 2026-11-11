import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SmolShell } from "@/components/smol/smol-shell";

export const metadata = { title: { default: "SmolBusiness", template: "%s · SmolBusiness" } };

/** Admins only; an account with no role gets a 404. Pages below re-check superadmin-only areas. */
export default async function SmolLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/logout");
  if (!user.role) notFound();
  return (
    <SmolShell user={{ name: user.name, email: user.email, avatar: user.avatar ?? null, role: user.role }} dbName={process.env.SMOL_DB_NAME || "SmolBusiness_Test"}>
      {children}
    </SmolShell>
  );
}
