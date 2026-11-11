"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search, Store, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { SmolMeta } from "@/components/smol/smol-ui";

export interface PaletteLink {
  label: string;
  href: string;
  icon: LucideIcon;
  group: string;
}
interface Item extends PaletteLink {
  hint?: string;
}

const MAX_SELLERS = 8;

/** ⌘K / Ctrl+K: jump to any page or seller, or search orders and customers by the typed text. */
export function CommandPalette({ links, meta }: { links: PaletteLink[]; meta: SmolMeta | null }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLUListElement>(null);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("smol:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("smol:palette", onOpen);
    };
  }, []);

  const items = React.useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const pages = links.filter((link) => !q || link.label.toLowerCase().includes(q));
    const sellers = q
      ? (meta?.stores ?? [])
          .filter((store) => store.name?.toLowerCase().includes(q) || store.domain?.toLowerCase().includes(q))
          .slice(0, MAX_SELLERS)
          .map((store) => ({ label: store.name || store.domain, hint: store.domain, href: `/smol/seller/${store.id}`, icon: Store, group: "Sellers" }))
      : [];
    const searches = q
      ? links
          .filter((link) => ["/smol/orders", "/smol/customers", "/smol/stores"].includes(link.href))
          .map((link) => ({ ...link, label: `Search ${link.label.toLowerCase()} for “${query.trim()}”`, href: `${link.href}?q=${encodeURIComponent(query.trim())}`, icon: Search, group: "Search" }))
      : [];
    return [...sellers, ...pages, ...searches];
  }, [links, meta, query]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  };

  React.useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let lastGroup = "";
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setQuery("");
        setActive(0);
      }}
    >
      <DialogContent size="lg" hideClose className="top-[15vh] translate-y-0">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") setActive((index) => Math.min(index + 1, items.length - 1));
              else if (event.key === "ArrowUp") setActive((index) => Math.max(index - 1, 0));
              else if (event.key === "Enter") go(items[active]);
              else return;
              event.preventDefault();
            }}
            placeholder="Search sellers, pages, orders…"
            className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
            aria-label="Search"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">Esc</kbd>
        </div>
        <ul ref={listRef} className="fd-scroll-thin max-h-[50vh] overflow-y-auto p-1.5" role="listbox">
          {items.length === 0 ? <li className="px-3 py-6 text-center text-[13px] text-muted-foreground">No matches</li> : null}
          {items.map((item, index) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            const Icon = item.icon;
            return (
              <React.Fragment key={`${item.group}:${item.href}`}>
                {header ? <li className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">{header}</li> : null}
                <li
                  data-index={index}
                  role="option"
                  aria-selected={index === active}
                  onMouseMove={() => setActive(index)}
                  onClick={() => go(item)}
                  className={cn("flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px]", index === active && "bg-muted")}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint ? <span className="truncate font-mono text-[11px] text-muted-foreground">{item.hint}</span> : null}
                  {index === active ? <CornerDownLeft className="size-3.5 text-muted-foreground" /> : null}
                </li>
              </React.Fragment>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
