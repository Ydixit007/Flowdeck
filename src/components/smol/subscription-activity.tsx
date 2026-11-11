"use client";

import Link from "next/link";
import type { SubActivityKind } from "@/lib/smol-subscriptions";
import { Badge } from "@/components/ui/badge";
import { fmtDate, money, sellerHref } from "@/components/smol/smol-ui";

export interface SubActivityRow {
  kind: SubActivityKind;
  storeId: string;
  name?: string;
  plan?: string;
  fromPlan?: string;
  cycle?: string;
  amount?: number;
  by?: string;
  at: string | Date;
}

const KIND: Record<SubActivityKind, { label: string; variant: "success" | "warning" | "danger" | "primary" | "default" }> = {
  new: { label: "New", variant: "success" },
  renewed: { label: "Renewed", variant: "success" },
  renewal_failed: { label: "Renewal failed", variant: "danger" },
  upgraded: { label: "Upgraded", variant: "success" },
  downgraded: { label: "Downgraded", variant: "warning" },
  changed: { label: "Changed", variant: "default" },
  cancelled: { label: "Cancel requested", variant: "warning" },
  ended: { label: "Ended", variant: "danger" },
  admin: { label: "Admin change", variant: "primary" },
};

const planText = (row: SubActivityRow) => `${row.fromPlan ? `${row.fromPlan} → ` : ""}${row.plan ?? "—"}${row.cycle === "annual" ? " · annual" : ""}`;

/** Subscription moments, newest first; `seller` adds a seller column, `compact` renders two-line rows for narrow tiles. */
export function SubscriptionActivity({ rows, seller = true, empty, compact }: { rows: SubActivityRow[]; seller?: boolean; empty: string; compact?: boolean }) {
  if (!rows.length) return <p className="px-4 py-8 text-center text-[12px] text-muted-foreground">{empty}</p>;
  if (compact) {
    return (
      <ul className="text-[13px]">
        {rows.map((row, index) => (
          <li key={`${row.storeId}-${row.kind}-${String(row.at)}-${index}`}>
            <Link href={sellerHref(row.storeId)} className="flex items-center gap-3 px-4 py-2 hover:bg-muted/50" title={row.by ? `By ${row.by}` : undefined}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{row.name ?? row.storeId}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {planText(row)} · {fmtDate(row.at, "d MMM")}
                  {row.amount ? ` · ${money(row.amount)}` : ""}
                </span>
              </span>
              <Badge variant={KIND[row.kind].variant}>{KIND[row.kind].label}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="fd-scroll-thin overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead className="text-left text-[12px] text-muted-foreground">
          <tr className="border-b border-border bg-surface-sunken/60">
            <th className="px-4 py-2 font-medium">When</th>
            {seller ? <th className="px-3 py-2 font-medium">Seller</th> : null}
            <th className="px-3 py-2 font-medium">Event</th>
            <th className="px-3 py-2 font-medium">Plan</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, index) => (
            <tr key={`${row.storeId}-${row.kind}-${String(row.at)}-${index}`}>
              <td className="whitespace-nowrap px-4 py-2 tabular-nums text-muted-foreground">{fmtDate(row.at, "d MMM yyyy")}</td>
              {seller ? (
                <td className="max-w-48 truncate px-3 py-2">
                  <Link href={sellerHref(row.storeId)} className="hover:text-primary">
                    {row.name ?? row.storeId}
                  </Link>
                </td>
              ) : null}
              <td className="px-3 py-2">
                <Badge variant={KIND[row.kind].variant}>{KIND[row.kind].label}</Badge>
                {row.by ? <span className="ml-1.5 text-[11px] text-muted-foreground">by {row.by}</span> : null}
              </td>
              <td className="whitespace-nowrap px-3 py-2">{planText(row)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.amount ? money(row.amount) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
