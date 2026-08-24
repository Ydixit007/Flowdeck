"use client";

import * as React from "react";
import { WifiOff } from "lucide-react";

/** Thin status strip: the app keeps working from cache, so this is informational. */
export function OfflineBanner() {
  const [offline, setOffline] = React.useState(false);

  React.useEffect(() => {
    const sync = (): void => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/12 px-3 py-1.5 text-[12px] font-medium text-warning"
    >
      <WifiOff className="size-3.5" />
      Offline — showing cached data. Changes will need a connection to save.
    </div>
  );
}
