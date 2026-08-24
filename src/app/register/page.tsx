"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { api } from "@/lib/client/api";
import { registerSchema } from "@/lib/validation";
import { browserTimezone } from "@/lib/client/datetime";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RegisterValues = z.infer<typeof registerSchema>;

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const inviteToken = params.get("invite");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (values: RegisterValues): Promise<void> => {
    try {
      await api.post("/api/auth/register", { ...values, timezone: browserTimezone() });
      // Accepting the invite needs the session the register call just created.
      if (inviteToken) {
        try {
          await api.post("/api/invites/accept", { token: inviteToken });
        } catch {
          toast.error("Account created, but the invite link was invalid.");
        }
      }
      router.push("/");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create your account");
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Your workspace and calendar are ready in one step."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" autoComplete="name" autoFocus aria-invalid={Boolean(errors.name)} {...register("name")} />
          {errors.name ? <p className="text-[12px] text-destructive">{errors.name.message}</p> : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            autoComplete="username"
            placeholder="yash"
            aria-invalid={Boolean(errors.username)}
            {...register("username")}
          />
          <p className="text-[11px] text-muted-foreground">Used for @mentions.</p>
          {errors.username ? <p className="text-[12px] text-destructive">{errors.username.message}</p> : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} {...register("email")} />
          {errors.email ? <p className="text-[12px] text-destructive">{errors.email.message}</p> : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.password)}
            {...register("password")}
          />
          <p className="text-[11px] text-muted-foreground">At least 8 characters.</p>
          {errors.password ? <p className="text-[12px] text-destructive">{errors.password.message}</p> : null}
        </div>

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}

export default function Page() {
  // useSearchParams needs a Suspense boundary for static prerendering.
  return (
    <React.Suspense fallback={null}>
      <RegisterForm />
    </React.Suspense>
  );
}
