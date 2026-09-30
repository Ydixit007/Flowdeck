import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isSmolAdmin } from "@/server/smol";
import { toPublicUser } from "@/server/users";
import { SmolShell } from "@/components/smol/smol-shell";

export const metadata = { title: { default: "SmolBusiness", template: "%s · SmolBusiness" } };

/** Separate dashboard: its own shell, only for SMOL_ADMIN_EMAILS. Everyone else gets a 404. */
export default async function SmolLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isSmolAdmin(user)) notFound();
  const { name, username, avatar } = toPublicUser(user);
  return (
    <SmolShell user={{ name, username, avatar }} dbName={process.env.SMOL_DB_NAME || "SmolBusiness_Test"}>
      {children}
    </SmolShell>
  );
}
