"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BarChart3,
  Coins,
  Download,
  FileJson,
  FileSpreadsheet,
  History,
  KeyRound,
  ScrollText,
  LayoutDashboard,
  Lightbulb,
  Lock,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  MessageSquare,
  Package,
  Palette,
  Receipt,
  Search,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Ticket,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { SMOL_COLLECTIONS, canReadCollection, type AdminRole, type SmolCollectionName } from "@/lib/smol-config";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { RecordDialog, SmolContext, type SmolMeta } from "@/components/smol/smol-ui";
import { RecordActions } from "@/components/smol/record-actions";
import { CommandPalette, type PaletteLink } from "@/components/smol/command-palette";

const ICONS: Record<SmolCollectionName, LucideIcon> = {
  stores: Store,
  storelayoutrevisions: History,
  orders: ShoppingBag,
  customers: Users,
  products: Package,
  reviews: Star,
  coupons: Ticket,
  billingorders: Receipt,
  credittransactions: Coins,
  emailbudgets: Mail,
  announcements: Megaphone,
  themes: Palette,
  featurerequests: Lightbulb,
  contacts: MessageSquare,
  adminactions: ScrollText,
  otps: KeyRound,
};
const GROUPS = ["Sellers", "Commerce", "Billing", "Platform"] as const;

interface SmolUser {
  name: string;
  email: string;
  avatar: string | null;
  role: AdminRole;
}
const NAMES = Object.keys(SMOL_COLLECTIONS) as SmolCollectionName[];

type Crumb = { label: string; href?: string };

function crumbs(pathname: string, storeName: (id: string) => string): Crumb[] {
  const [, , section, id] = pathname.split("/");
  if (!section) return [{ label: "Overview" }];
  if (section === "seller") return [{ label: "Sellers", href: "/smol/stores" }, { label: id ? storeName(id) : "Seller" }];
  const fixed: Record<string, string> = { analytics: "Analytics", admins: "Admins", account: "Account" };
  return [{ label: fixed[section] ?? SMOL_COLLECTIONS[section as SmolCollectionName]?.label ?? "SmolBusiness" }];
}

function paletteLinks(role: AdminRole): PaletteLink[] {
  const superadmin = role === "superadmin";
  return [
    ...(superadmin
      ? [
          { label: "Overview", href: "/smol", icon: LayoutDashboard, group: "Pages" },
          { label: "Analytics", href: "/smol/analytics", icon: BarChart3, group: "Pages" },
        ]
      : []),
    ...NAMES.filter((name) => canReadCollection(role, name)).map((name) => ({ label: SMOL_COLLECTIONS[name].label, href: `/smol/${name}`, icon: ICONS[name], group: "Pages" })),
    ...(superadmin ? [{ label: "Admins", href: "/smol/admins", icon: ShieldCheck, group: "Pages" }] : []),
    { label: "Account", href: "/smol/account", icon: UserRound, group: "Pages" },
  ];
}

export function SmolShell({
  user,
  dbName,
  children,
}: {
  user: SmolUser;
  dbName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [meta, setMeta] = React.useState<SmolMeta | null>(null);
  const [record, setRecord] = React.useState<{ name: SmolCollectionName; id: string } | null>(null);
  const [navOpen, setNavOpen] = React.useState(false);

  React.useEffect(() => {
    document.documentElement.classList.add("smol-theme");
    void api
      .get<SmolMeta>("/api/smol/meta")
      .then(setMeta)
      .catch(() => toast.error("Could not reach the SmolBusiness database"));
    return () => document.documentElement.classList.remove("smol-theme");
  }, []);

  // Navigating closes the mobile nav and any open record.
  const [prevPath, setPrevPath] = React.useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setNavOpen(false);
    setRecord(null);
  }

  const context = React.useMemo(() => {
    const names = new Map((meta?.stores ?? []).map((store) => [store.id, store.name]));
    return {
      role: user.role,
      email: user.email,
      meta,
      storeName: (id: string) => names.get(id) ?? id.slice(-6),
      openRecord: (name: SmolCollectionName, id: string) => setRecord({ name, id }),
    };
  }, [meta, user.role, user.email]);
  const links = React.useMemo(() => paletteLinks(user.role), [user.role]);

  return (
    <SmolContext.Provider value={context}>
      <div className="flex h-dvh overflow-hidden bg-background">
        <div className="hidden w-60 shrink-0 lg:block">
          <SmolSidebar meta={meta} dbName={dbName} role={user.role} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <SmolTopbar crumbs={crumbs(pathname, context.storeName)} user={user} onOpenNav={() => setNavOpen(true)} />
          <main className="fd-scroll-thin flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>

      <Dialog open={navOpen} onOpenChange={setNavOpen}>
        <DialogContent size="sm" className="left-0 top-0 h-dvh max-w-64 translate-x-0 rounded-none border-y-0">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <SmolSidebar meta={meta} dbName={dbName} role={user.role} />
        </DialogContent>
      </Dialog>

      <CommandPalette links={links} meta={meta} />

      <RecordDialog
        target={record}
        onClose={() => setRecord(null)}
        onOpen={(name, id) => setRecord({ name, id })}
        actions={(name, doc, reload) => <RecordActions name={name} doc={doc} onChanged={reload} />}
      />
    </SmolContext.Provider>
  );
}

function NavLink({
  href,
  icon: Icon,
  label,
  count,
  active,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  count?: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-[6px] text-[13px] font-medium transition-colors",
        active ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active && "text-primary")} />
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined ? <span className="text-[11px] tabular-nums text-muted-foreground/70">{count.toLocaleString("en-IN")}</span> : null}
    </Link>
  );
}

function SmolSidebar({ meta, dbName, role }: { meta: SmolMeta | null; dbName: string; role: AdminRole }) {
  const superadmin = role === "superadmin";
  const pathname = usePathname();
  const section = pathname.split("/")[2] ?? "";

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-surface-sunken">
      <div className="flex h-14 items-center gap-2 px-4">
        <span className="flex size-7 items-center justify-center rounded-[7px] bg-primary text-primary-foreground">
          <Store className="size-4" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="text-[14px] font-semibold tracking-tight">SmolBusiness</p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{superadmin ? "Platform admin" : "Marketing"}</p>
        </div>
      </div>

      <nav className="fd-scroll-thin flex-1 space-y-4 overflow-y-auto px-2 pb-4 pt-1" aria-label="SmolBusiness">
        {superadmin ? (
          <div className="space-y-0.5">
            <NavLink href="/smol" icon={LayoutDashboard} label="Overview" active={section === ""} />
            <NavLink href="/smol/analytics" icon={BarChart3} label="Analytics" active={section === "analytics"} />
          </div>
        ) : null}
        {GROUPS.map((group) => {
          const names = NAMES.filter((name) => SMOL_COLLECTIONS[name].group === group && canReadCollection(role, name));
          return names.length ? (
          <div key={group}>
            <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">{group}</p>
            <ul className="space-y-0.5">
              {names.map((name) => (
                <li key={name}>
                  <NavLink
                    href={`/smol/${name}`}
                    icon={ICONS[name]}
                    label={SMOL_COLLECTIONS[name].label}
                    count={meta?.counts[name]}
                    active={section === name || (name === "stores" && section === "seller")}
                  />
                </li>
              ))}
            </ul>
          </div>
          ) : null;
        })}
        {superadmin ? (
          <div className="space-y-0.5">
            <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Team</p>
            <NavLink href="/smol/admins" icon={ShieldCheck} label="Admins" active={section === "admins"} />
          </div>
        ) : null}
      </nav>

      <div className="flex items-center gap-2 border-t border-border py-1.5 pl-4 pr-2 text-[11px] text-muted-foreground">
        <Lock className="size-3 shrink-0" />
        <span className="flex-1 truncate">
          Read-only · <span className="font-mono">{dbName}</span>
        </span>
        {superadmin ? <ExportButton /> : null}
      </div>
    </aside>
  );
}

function ExportButton() {
  const [busy, setBusy] = React.useState(false);
  const download = async (format: "json" | "csv"): Promise<void> => {
    setBusy(true);
    try {
      const response = await fetch(`/api/smol/export?format=${format}`);
      if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message);
      const name = /filename="(.+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? `smol-export.${format}`;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(await response.blob());
      link.download = name;
      link.click();
      URL.revokeObjectURL(link.href);
    } finally {
      setBusy(false);
    }
  };
  const run = (format: "json" | "csv") =>
    toast.promise(download(format), {
      loading: "Exporting database + PostHog…",
      success: "Export downloaded",
      error: (error: Error) => error.message || "Export failed",
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" disabled={busy} aria-label="Export all data" title="Export all data">
          <Download className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top">
        <DropdownMenuItem onSelect={() => run("json")}>
          <FileJson /> JSON (single file)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run("csv")}>
          <FileSpreadsheet /> CSV (zip, one per table)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SmolTopbar({
  crumbs,
  user,
  onOpenNav,
}: {
  crumbs: Crumb[];
  user: SmolUser;
  onOpenNav: () => void;
}) {
  const router = useRouter();
  const signOut = async (): Promise<void> => {
    try {
      await api.post("/api/auth/logout");
      router.push("/login");
    } catch {
      toast.error("Could not sign out");
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md sm:px-5">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenNav} aria-label="Open navigation">
        <Menu />
      </Button>
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1.5 text-[14px]">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <li key={index} className={cn("flex min-w-0 items-center gap-1.5", !last && "shrink-0")}>
                {index > 0 ? <span className="text-muted-foreground/60">/</span> : null}
                {crumb.href && !last ? (
                  <Link href={crumb.href} className="text-muted-foreground transition-colors hover:text-foreground">
                    {crumb.label}
                  </Link>
                ) : (
                  <h1 className={cn("truncate", last ? "font-semibold tracking-tight" : "text-muted-foreground")} aria-current={last ? "page" : undefined}>
                    {crumb.label}
                  </h1>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("smol:palette"))}
        className="hidden h-8 w-64 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-[13px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground md:flex"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Search sellers, pages…</span>
        <kbd className="rounded border border-border px-1 text-[10px]">Ctrl K</kbd>
      </button>
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => window.dispatchEvent(new Event("smol:palette"))} aria-label="Search">
        <Search />
      </Button>
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Account menu">
            <Avatar name={user.name} src={user.avatar} size="md" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="px-2 py-2">
            <p className="truncate text-[13px] font-medium">{user.name}</p>
            <p className="truncate text-[12px] text-muted-foreground">{user.email}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => router.push("/smol/account")}>
            <UserRound /> Account
          </DropdownMenuItem>
          <DropdownMenuItem destructive onSelect={() => void signOut()}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
