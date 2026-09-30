"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDate } from "@/components/smol/smol-ui";

// Keys are "YYYY-MM" (month) or "YYYY-MM-DD"; anything else (e.g. a stale key mid-transition) renders as-is.
function tickLabel(key: string, interval: string): string {
  if (/^\d{4}-\d{2}$/.test(key)) return fmtDate(`${key}-01T00:00:00`, "MMM yy");
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return fmtDate(`${key}T00:00:00`, interval === "month" ? "MMM yy" : "d MMM");
  return key;
}

/** Loaded lazily: recharts is the heaviest dependency on the dashboard. */
export default function TrendChart({
  data,
  dataKey,
  interval,
  label,
  format,
  axisFormat,
}: {
  data: { key: string }[];
  dataKey: string;
  interval: string;
  label: string;
  format: (value: number) => string;
  axisFormat: (value: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="smolArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="key"
          tickFormatter={(key: string) => tickLabel(key, interval)}
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          stroke="var(--border)"
          minTickGap={24}
        />
        <YAxis
          width={56}
          allowDecimals={false}
          tickFormatter={axisFormat}
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          stroke="var(--border)"
        />
        <Tooltip
          labelFormatter={(key) => tickLabel(String(key), interval)}
          formatter={(value) => [format(Number(value)), label]}
          contentStyle={{
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--foreground)",
          }}
        />
        <Area type="monotone" dataKey={dataKey} stroke="var(--primary)" strokeWidth={2} fill="url(#smolArea)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
