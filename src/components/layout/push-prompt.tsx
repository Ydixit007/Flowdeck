"use client";

import * as React from "react";
import { toast } from "sonner";
import { BellRing, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "flowdeck.pushPromptDismissed";

function urlBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let index = 0; index < raw.length; index += 1) view[index] = raw.charCodeAt(index);
  return buffer;
}

/**
 * Contextual push opt-in. Rendered inside the notifications panel rather than
 * fired on first load, so permission is asked when the user is already thinking
 * about notifications.
 */
export function PushPrompt() {
  const [state, setState] = React.useState<"hidden" | "offer" | "working">("hidden");

  React.useEffect(() => {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    if (Notification.permission === "denied") return;

    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((existing) => {
        if (!existing) setState("offer");
      })
      .catch(() => undefined);
  }, []);

  const enable = async (): Promise<void> => {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) return;
    setState("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Notifications were blocked in your browser settings.");
        setState("hidden");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(key),
      });
      const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
      await api.post("/api/push/subscribe", { endpoint: json.endpoint, keys: json.keys });
      toast.success("Push notifications enabled");
      setState("hidden");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not enable notifications");
      setState("hidden");
    }
  };

  const dismiss = (): void => {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setState("hidden");
  };

  if (state === "hidden") return null;

  return (
    <div className="flex items-start gap-2.5 border-b border-border bg-accent/40 px-3 py-2.5">
      <BellRing className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium">Get reminders on this device</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          Push alerts for tasks starting soon, mentions and deadlines.
        </p>
        <Button size="sm" className="mt-2" loading={state === "working"} onClick={() => void enable()}>
          Enable notifications
        </Button>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
