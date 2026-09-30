"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BarChart3,
  Coins,
  History,
  KeyRound,
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
  ShoppingBag,
  Star,
  Store,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { SMOL_COLLECTIONS, type SmolCollectionName } from "@/lib/smol-config";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { DashboardSwitch, rememberDashboard } from "@/components/layout/dashboard-switch";
import { RecordDialog, SmolContext, type SmolMeta } from "@/components/smol/smol-ui";

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
  otps: KeyRound,
};
const GROUPS = ["Sellers", "Commerce", "Billing", "Platform"] as const;
const NAMES = Object.keys(SMOL_COLLECTIONS) as SmolCollectionName[];

function pageTitle(pathname: string): string {
  const [, , section] = pathname.split("/");
  if (!section) return "Overview";
  if (section === "seller") return "Seller";
  if (section === "analytics") return "Analytics";
  return SMOL_COLLECTIONS[section as SmolCollectionName]?.label ?? "SmolBusiness";
}

export function SmolShell({
  user,
  dbName,
  children,
}: {
  user: { name: string; username: string; avatar: string | null };
  dbName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [meta, setMeta] = React.useState<SmolMeta | null>(null);
  const [record, setRecord] = React.useState<{ name: SmolCollectionName; id: string } | null>(null);
  const [navOpen, setNavOpen] = React.useState(false);

  React.useEffect(() => {
    rememberDashboard("smol");
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
      meta,
      storeName: (id: string) => names.get(id) ?? id.slice(-6),
      openRecord: (name: SmolCollectionName, id: string) => setRecord({ name, id }),
    };
  }, [meta]);

  return (
    <SmolContext.Provider value={context}>
      <div className="flex h-dvh overflow-hidden bg-background">
        <div className="hidden w-60 shrink-0 lg:block">
          <SmolSidebar meta={meta} dbName={dbName} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <SmolTopbar title={pageTitle(pathname)} user={user} onOpenNav={() => setNavOpen(true)} />
          <main className="fd-scroll-thin flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>

      <Dialog open={navOpen} onOpenChange={setNavOpen}>
        <DialogContent size="sm" className="left-0 top-0 h-dvh max-w-64 translate-x-0 rounded-none border-y-0">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <SmolSidebar meta={meta} dbName={dbName} />
        </DialogContent>
      </Dialog>

      <RecordDialog target={record} onClose={() => setRecord(null)} onOpen={(name, id) => setRecord({ name, id })} />
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

function SmolSidebar({ meta, dbName }: { meta: SmolMeta | null; dbName: string }) {
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
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Platform admin</p>
        </div>
      </div>

      <nav className="fd-scroll-thin flex-1 space-y-4 overflow-y-auto px-2 pb-4 pt-1" aria-label="SmolBusiness">
        <div className="space-y-0.5">
          <NavLink href="/smol" icon={LayoutDashboard} label="Overview" active={section === ""} />
          <NavLink href="/smol/analytics" icon={BarChart3} label="Analytics" active={section === "analytics"} />
        </div>
        {GROUPS.map((group) => (
          <div key={group}>
            <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">{group}</p>
            <ul className="space-y-0.5">
              {NAMES.filter((name) => SMOL_COLLECTIONS[name].group === group).map((name) => (
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
        ))}
      </nav>

      <div className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
        <Lock className="size-3 shrink-0" />
        <span className="truncate">
          Read-only · <span className="font-mono">{dbName}</span>
        </span>
      </div>
    </aside>
  );
}

function SmolTopbar({
  title,
  user,
  onOpenNav,
}: {
  title: string;
  user: { name: string; username: string; avatar: string | null };
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
      <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight">
        <span className="hidden text-muted-foreground sm:inline">SmolBusiness / </span>
        {title}
      </h1>
      <DashboardSwitch current="smol" />
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
            <p className="truncate text-[12px] text-muted-foreground">@{user.username}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => void signOut()}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
