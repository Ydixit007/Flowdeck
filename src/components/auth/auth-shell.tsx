import Link from "next/link";
import { Layers } from "lucide-react";

/** Shared frame for sign-in, sign-up and password screens. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/login" className="mb-8 inline-flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-[7px] bg-primary text-primary-foreground">
              <Layers className="size-4" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Flowdeck</span>
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>
          <div className="mt-6">{children}</div>
          {footer ? <div className="mt-5 text-[13px] text-muted-foreground">{footer}</div> : null}
        </div>
      </div>

      <div className="relative hidden overflow-hidden border-l border-border bg-surface-sunken lg:block">
        <div className="absolute inset-0 flex flex-col justify-center px-14">
          <p className="max-w-md text-2xl font-semibold leading-snug tracking-tight">
            Plan it. Share it. Ship it.
          </p>
          <p className="mt-3 max-w-md text-[13px] leading-relaxed text-muted-foreground">
            A calendar-first command centre: development work, personal tasks and content plans on one
            timeline — with your team&apos;s work visible alongside your own.
          </p>
          <ul className="mt-8 space-y-2.5 text-[13px] text-muted-foreground">
            {[
              "Today, week, 15-day and month views",
              "Recurring work without duplicate clutter",
              "Reminders that reach your devices",
              "Shared projects, comments and presence",
            ].map((line) => (
              <li key={line} className="flex items-center gap-2.5">
                <span className="size-1.5 rounded-full bg-primary" />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div
          aria-hidden
          className="absolute -right-24 -top-24 size-96 rounded-full bg-primary/10 blur-3xl"
        />
      </div>
    </div>
  );
}
