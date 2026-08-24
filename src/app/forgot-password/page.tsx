"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/client/api";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [devLink, setDevLink] = React.useState<string | null>(null);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setSending(true);
    try {
      const result = await api.post<{ sent: boolean; devLink?: string }>("/api/auth/forgot-password", { email });
      setSent(true);
      setDevLink(result.devLink ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the reset link");
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll send a link to set a new one."
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-3 rounded-lg border border-border bg-surface-sunken p-4">
          <p className="text-[13px]">
            If an account exists for <span className="font-medium">{email}</span>, a reset link is on its way.
          </p>
          {devLink ? (
            <p className="text-[12px] text-muted-foreground">
              No mail transport is configured in development. Use{" "}
              <Link href={devLink} className="font-medium text-primary hover:underline">
                this reset link
              </Link>
              .
            </p>
          ) : null}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" loading={sending}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
