"use client";

import * as React from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "flowdeck.installDismissed";

/** Uses the browser's own install event; shown only when the browser offers it. */
export function InstallPrompt() {
  const [event, setEvent] = React.useState<BeforeInstallPromptEvent | null>(null);

  React.useEffect(() => {
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    const handler = (raw: Event): void => {
      raw.preventDefault();
      setEvent(raw as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!event) return null;

  const install = async (): Promise<void> => {
    await event.prompt();
    await event.userChoice;
    setEvent(null);
  };

  const dismiss = (): void => {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setEvent(null);
  };

  return (
    <div className="fixed bottom-20 left-1/2 z-40 flex w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-surface-raised px-3.5 py-3 fd-elevated lg:bottom-5 lg:left-auto lg:right-5 lg:translate-x-0">
      <Download className="size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">Install Flowdeck</p>
        <p className="text-[11px] text-muted-foreground">Launch it like an app and get reminders.</p>
      </div>
      <Button size="sm" onClick={() => void install()}>
        Install
      </Button>
      <button
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
