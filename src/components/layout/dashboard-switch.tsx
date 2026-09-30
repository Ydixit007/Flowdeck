"use client";

import { useRouter } from "next/navigation";
import { Layers, Store } from "lucide-react";
import { cn } from "@/lib/utils";

export type Dashboard = "flowdeck" | "smol";

const KEY = "fd:dashboard";
const HOME: Record<Dashboard, string> = { flowdeck: "/", smol: "/smol" };

export function rememberDashboard(dashboard: Dashboard): void {
  try {
    localStorage.setItem(KEY, dashboard);
  } catch {
    // Storage blocked (private mode): the switch still works, it just isn't remembered.
  }
}

export function lastDashboard(): Dashboard | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "smol" || value === "flowdeck" ? value : null;
  } catch {
    return null;
  }
}

const OPTIONS = [
  { key: "flowdeck", label: "Flowdeck", icon: Layers },
  { key: "smol", label: "SmolBusiness", icon: Store },
] as const;

/** Header toggle between the two dashboards; the choice is reopened on next visit. */
export function DashboardSwitch({ current }: { current: Dashboard }) {
  const router = useRouter();

  const go = (dashboard: Dashboard): void => {
    if (dashboard === current) return;
    rememberDashboard(dashboard);
    router.push(HOME[dashboard]);
  };

  return (
    <div role="group" aria-label="Dashboard" className="flex shrink-0 items-center rounded-lg border border-border bg-surface-sunken p-0.5">
      {OPTIONS.map((option) => {
        const active = option.key === current;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={active}
            onClick={() => go(option.key)}
            title={`Switch to ${option.label}`}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              active ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <option.icon className={cn("size-3.5", active && "text-primary")} />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
