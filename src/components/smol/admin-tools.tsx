"use client";

import * as React from "react";
import { toast } from "sonner";
import { api } from "@/lib/client/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { fmtDate, num, useSmolFetch } from "@/components/smol/smol-ui";

// Superadmin tools backed by the backend admin API (SMOL-415, SMOL-418).

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Could not apply");

interface OtpLimitState {
  phone: string;
  sends: number;
  limit: number;
  limitedUntil: string | null;
}

/** OTP send limit for one number; `phone` fixes it (seller page), otherwise there is a lookup box. */
export function OtpLimit({ phone: fixed }: { phone?: string }) {
  const [typed, setTyped] = React.useState("");
  const [lookup, setLookup] = React.useState(fixed ?? "");
  const { data, error, reload } = useSmolFetch<OtpLimitState>(/^[6-9]\d{9}$/.test(lookup) ? `/api/smol/admin/otp-limit?phone=${lookup}` : null);
  const [busy, setBusy] = React.useState(false);

  const clear = async () => {
    setBusy(true);
    try {
      await api.post("/api/smol/admin/otp-limit/clear", { phone: lookup });
      toast.success(`OTP limit cleared for ${lookup}`);
      reload();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      {fixed ? null : (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setLookup(typed.trim());
          }}
        >
          <Input value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="10-digit phone" inputMode="numeric" pattern="[6-9][0-9]{9}" className="h-8 w-40" aria-label="Phone number" />
          <Button size="sm" variant="secondary" type="submit">
            Check
          </Button>
        </form>
      )}
      {error ? <span className="text-destructive">{error}</span> : null}
      {data && data.phone === lookup ? (
        <>
          <span className="text-muted-foreground tabular-nums">
            {data.sends}/{data.limit} codes sent this hour
          </span>
          {data.limitedUntil ? <Badge variant="danger">limited until {fmtDate(data.limitedUntil, "HH:mm")}</Badge> : <Badge variant="success">not limited</Badge>}
          <Button size="sm" variant="secondary" disabled={busy || data.sends === 0} onClick={clear}>
            Clear limit
          </Button>
        </>
      ) : null}
    </div>
  );
}

interface Budget {
  day: string;
  sent: number;
  cap: number;
  remaining: number;
}

/** Today's platform-wide email budget (UTC day) with reset and one-day raise. */
export function EmailBudget() {
  const { data, error, reload } = useSmolFetch<Budget>("/api/smol/admin/email-budget");
  const [extra, setExtra] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const apply = async (body: { action: "reset" } | { action: "raise"; amount: number }, done: string) => {
    setBusy(true);
    try {
      await api.post("/api/smol/admin/email-budget", body);
      toast.success(done);
      setExtra("");
      reload();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const amount = Number(extra);

  return (
    <section className="fd-panel flex flex-wrap items-center gap-3 p-3 text-[13px]">
      <span className="font-medium">Today ({data?.day ?? "…"} UTC)</span>
      {error ? <span className="text-destructive">{error}</span> : null}
      {data ? (
        <span className="tabular-nums text-muted-foreground">
          {num(data.sent)} of {num(data.cap)} sent · {num(data.remaining)} left
        </span>
      ) : null}
      <Button size="sm" variant="secondary" disabled={busy || !data} onClick={() => apply({ action: "reset" }, "Email count reset for today")}>
        Reset count
      </Button>
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void apply({ action: "raise", amount }, `${amount} extra sends for today`);
        }}
      >
        <Input type="number" min={1} max={10000} step={1} value={extra} onChange={(event) => setExtra(event.target.value)} placeholder="Extra sends" className="h-8 w-32" aria-label="Extra sends today" />
        <Button size="sm" type="submit" disabled={busy || !Number.isInteger(amount) || amount < 1}>
          Add for today
        </Button>
      </form>
      <span className="text-[12px] text-muted-foreground">Brevo&apos;s own daily limit still applies; raising past it only makes sends fail there.</span>
    </section>
  );
}

interface FeatureRow {
  key: string;
  minPlan: string;
  byPlan: boolean;
  granted: boolean;
}

/** Per-seller feature grants on top of the plan (SMOL-418). */
export function FeatureAccess({ id }: { id: string }) {
  const { data, error } = useSmolFetch<FeatureRow[]>(`/api/smol/admin/stores/${id}/features`);
  const [rows, setRows] = React.useState<FeatureRow[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const list = rows ?? data;

  const toggle = async (row: FeatureRow) => {
    setBusy(row.key);
    try {
      setRows(await api.post<FeatureRow[]>(`/api/smol/admin/stores/${id}/features`, { feature: row.key, enabled: !row.granted }));
      toast.success(`${row.key.replace(/_/g, " ")} ${row.granted ? "revoked" : "granted"}`);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  if (error) return <p className="text-[13px] text-destructive">{error}</p>;
  if (!list) return <p className="text-[13px] text-muted-foreground">Loading…</p>;
  return (
    <ul className="grid gap-2 text-[13px] sm:grid-cols-2">
      {list.map((row) => (
        <li key={row.key}>
          <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 has-[:disabled]:cursor-default">
            <span className="min-w-0 flex-1">
              <span className="block truncate capitalize">{row.key.replace(/_/g, " ")}</span>
              <span className="text-[11px] text-muted-foreground">{row.byPlan ? "in plan" : row.granted ? "granted" : `${row.minPlan}+ plan`}</span>
            </span>
            <Switch checked={row.byPlan || row.granted} disabled={row.byPlan || busy === row.key} onCheckedChange={() => void toggle(row)} aria-label={row.key.replace(/_/g, " ")} />
          </label>
        </li>
      ))}
    </ul>
  );
}
