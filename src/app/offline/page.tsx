import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl border border-border bg-surface-sunken text-muted-foreground">
        <WifiOff className="size-5" />
      </span>
      <h1 className="text-base font-semibold tracking-tight">You are offline</h1>
      <p className="max-w-sm text-[13px] text-muted-foreground">
        Flowdeck kept the app shell and your recently viewed data. Reconnect to save changes and load
        anything new.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground"
      >
        Try again
      </Link>
    </div>
  );
}
