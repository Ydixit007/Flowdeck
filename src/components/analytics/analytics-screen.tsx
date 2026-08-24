"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { api, qs } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import { formatMinutes } from "@/lib/utils";
import type { AnalyticsPayload } from "@/app/api/analytics/route";
import { EmptyState, Skeleton, Tabs, TabsList, TabsTrigger } from "@/components/ui/misc";
import { PRIORITY_META } from "@/components/tasks/task-meta";

const RANGES = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: "var(--priority-urgent)",
  HIGH: "var(--priority-high)",
  MEDIUM: "var(--priority-medium)",
  LOW: "var(--priority-low)",
  NONE: "var(--priority-none)",
};

export function AnalyticsScreen() {
  const { workspaceId } = useApp();
  const [days, setDays] = React.useState("30");
  const [data, setData] = React.useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    void api
      .get<AnalyticsPayload>(`/api/analytics${qs({ workspaceId, days })}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [workspaceId, days]);

  if (loading && !data) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 p-3 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-3xl p-5">
        <div className="fd-panel">
          <EmptyState icon={<BarChart3 />} title="No analytics yet" description="Complete some tasks and check back." />
        </div>
      </div>
    );
  }

  const estimateAccuracy =
    data.totals.estimatedMinutes > 0
      ? Math.round((data.totals.actualMinutes / data.totals.estimatedMinutes) * 100)
      : null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-3 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">Last {data.range.days} days</p>
        <Tabs value={days} onValueChange={setDays}>
          <TabsList>
            {RANGES.map((range) => (
              <TabsTrigger key={range.value} value={range.value}>
                {range.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Completed" value={String(data.totals.completed)} hint={`${data.totals.created} created`} />
        <Stat label="Completion rate" value={`${data.totals.completionRate}%`} hint={`${data.totals.open} still open`} />
        <Stat label="Overdue" value={String(data.totals.overdue)} hint="past their due time" />
        <Stat
          label="Time tracked"
          value={formatMinutes(data.totals.actualMinutes)}
          hint={
            estimateAccuracy === null
              ? `estimated ${formatMinutes(data.totals.estimatedMinutes)}`
              : `${estimateAccuracy}% of estimate`
          }
        />
      </div>

      <section className="fd-panel p-4">
        <h2 className="text-[13px] font-semibold">Tasks completed per day</h2>
        <div className="mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.perDay} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(value: string) => value.slice(8)}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
              />
              <ChartTooltip
                contentStyle={{
                  background: "var(--surface-raised)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--foreground)",
                }}
              />
              <Bar dataKey="scheduled" fill="var(--muted)" radius={[3, 3, 0, 0]} name="Scheduled" />
              <Bar dataKey="completed" fill="var(--primary)" radius={[3, 3, 0, 0]} name="Completed" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="fd-panel p-4">
          <h2 className="text-[13px] font-semibold">Weekly trend</h2>
          <div className="mt-3 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.weeklyTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                />
                <ChartTooltip
                  contentStyle={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="completed"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Completed"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="fd-panel p-4">
          <h2 className="text-[13px] font-semibold">By priority</h2>
          <div className="mt-3 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byPriority} layout="vertical" margin={{ top: 0, right: 8, left: 12, bottom: 0 }}>
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                />
                <YAxis
                  type="category"
                  dataKey="priority"
                  width={64}
                  tickFormatter={(value: string) => PRIORITY_META[value as keyof typeof PRIORITY_META]?.label ?? value}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                />
                <ChartTooltip
                  contentStyle={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" radius={[0, 3, 3, 0]} name="Tasks">
                  {data.byPriority.map((row) => (
                    <Cell key={row.priority} fill={PRIORITY_COLORS[row.priority] ?? "var(--primary)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="fd-panel p-4">
        <h2 className="text-[13px] font-semibold">By project</h2>
        {data.byProject.length === 0 ? (
          <p className="mt-2 text-[12px] text-muted-foreground">No project data in this range.</p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {data.byProject
              .slice()
              .sort((a, b) => b.total - a.total)
              .map((row) => {
                const percent = row.total > 0 ? Math.round((row.done / row.total) * 100) : 0;
                return (
                  <li key={row.projectId ?? "none"} className="space-y-1">
                    <div className="flex items-baseline justify-between text-[12px]">
                      <span className="flex items-center gap-1.5 font-medium">
                        <span className="size-2 rounded-full" style={{ background: row.color }} />
                        {row.name}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {row.done}/{row.total} · {percent}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${percent}%`, background: row.color }} />
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      {data.byPlatform.length > 0 ? (
        <section className="fd-panel p-4">
          <h2 className="text-[13px] font-semibold">Content by platform</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {data.byPlatform.map((row) => (
              <li
                key={row.platform}
                className="rounded-full border border-border px-2.5 py-1 text-[12px] text-muted-foreground"
              >
                {row.platform.charAt(0) + row.platform.slice(1).toLowerCase()}{" "}
                <span className="font-semibold tabular-nums text-foreground">{row.count}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="fd-panel p-3.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
