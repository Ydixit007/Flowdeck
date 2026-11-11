import Link from "next/link";
import { Store } from "lucide-react";

/** Shared frame for sign-in and password screens. */
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
    <div className="grid min-h-dvh">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/login" className="mb-8 inline-flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-[7px] bg-primary text-primary-foreground">
              <Store className="size-4" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">SmolBusiness Admin</span>
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>
          <div className="mt-6">{children}</div>
          {footer ? <div className="mt-5 text-[13px] text-muted-foreground">{footer}</div> : null}
        </div>
      </div>

    </div>
  );
}
