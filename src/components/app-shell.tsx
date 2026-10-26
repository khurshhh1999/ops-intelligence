"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { GridBackground } from "@/components/ui/grid-background";
import { PROJECT } from "@/lib/domain";
import { fmtDate } from "@/lib/dates";
import { SOURCES } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

const NAV = [
  {
    section: "Customer reporting",
    items: [
      { href: "/", sheet: "G-001", label: "Energization overview" },
      { href: "/register", sheet: "E-101", label: "Equipment register" },
      { href: "/suppliers", sheet: "P-201", label: "Supplier scorecard" },
      { href: "/simulator", sheet: "S-301", label: "Delay & recovery" },
      { href: "/brief", sheet: "X-401", label: "Weekly executive brief" },
    ],
  },
  {
    section: "Under the hood",
    items: [
      { href: "/pipeline", sheet: "D-501", label: "Pipeline & freshness" },
      { href: "/model", sheet: "D-502", label: "Semantic model & Power BI" },
    ],
  },
];

const ALL = NAV.flatMap((g) => g.items);

function activeItem(pathname: string) {
  return ALL.find((i) => (i.href === "/" ? pathname === "/" : pathname.startsWith(i.href))) ?? ALL[0];
}

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="#17171a" />
      <path d="M7 21h8l3-10 3 10h4" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="25" cy="21" r="2.6" fill="#e8590c" />
    </svg>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <Mark />
      <div className="leading-tight">
        <div className="text-[13px] font-semibold tracking-tight">Path to Energization</div>
        <div className="sheet-label text-[10px] text-muted-foreground">Control tower</div>
      </div>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const current = activeItem(usePathname());
  return (
    <nav className="flex flex-col gap-6">
      {NAV.map((group) => (
        <div key={group.section} className="flex flex-col">
          <div className="sheet-label mb-1.5 text-[10px] text-muted-foreground">{group.section}</div>
          {group.items.map((item) => {
            const active = item === current;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "group grid grid-cols-[46px_1fr] items-baseline border-l-2 py-1.5 pr-2 pl-2.5 text-[13px] transition-colors",
                  active
                    ? "border-signal bg-sidebar-accent font-medium text-foreground shadow-[0_1px_0_rgba(0,0,0,0.04)]"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <span className={cn("font-mono text-[11px]", active ? "text-signal" : "text-muted-foreground/70")}>
                  {item.sheet}
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function TitleBlock() {
  const rows: [string, string][] = [
    ["Project", PROJECT.name],
    ["Owner", PROJECT.owner],
    ["GC", PROJECT.gc],
    ["IT load", `${PROJECT.itMw} MW · 12 halls`],
    ["Issued", `${fmtDate(PROJECT.asOf)} · Rev 14`],
  ];
  return (
    <div className="border border-foreground/80 bg-card text-[11px]">
      <div className="border-b border-foreground/80 px-2.5 py-1.5">
        <div className="font-medium">{PROJECT.campus}</div>
        <div className="text-muted-foreground">{PROJECT.location}</div>
      </div>
      {rows.map(([k, v], i) => (
        <div
          key={k}
          className={cn("grid grid-cols-[58px_1fr] items-baseline px-2.5 py-1", i > 0 && "border-t border-border")}
        >
          <span className="sheet-label text-[9px] text-muted-foreground">{k}</span>
          <span className="truncate">{v}</span>
        </div>
      ))}
    </div>
  );
}

function TopStrip() {
  const current = activeItem(usePathname());
  const stale = SOURCES.filter((s) => s.hoursSinceSync > s.slaHours).length;
  return (
    <div className="no-print hidden items-center justify-between gap-6 border-b px-8 py-2.5 lg:flex">
      <div className="sheet-label truncate text-muted-foreground">
        Halcyon <span className="mx-1.5 text-border">/</span>
        <span className="text-foreground">
          {current.sheet} {current.label}
        </span>
      </div>
      <div className="sheet-label flex shrink-0 items-center gap-4 whitespace-nowrap text-muted-foreground">
        <Link href="/pipeline" className="inline-flex items-center gap-1.5 hover:text-foreground">
          <span className="size-1.5 rounded-full bg-ok" />
          {SOURCES.length - stale} sources fresh
          {stale > 0 && (
            <>
              <span className="ml-1 size-1.5 rounded-full bg-crit" />
              {stale} stale
            </>
          )}
        </Link>
        <span className="hidden xl:inline">Data as of {fmtDate(PROJECT.asOf)} 06:00 CT</span>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col gap-7 overflow-y-auto border-r border-sidebar-border bg-sidebar px-4 py-5 lg:flex">
        <Brand />
        <NavLinks />
        <div className="mt-auto flex flex-col gap-3">
          <TitleBlock />
          <p className="text-[11px] leading-snug text-muted-foreground">
            Synthetic project data. A forward-deployed analytics demo by Khursheed Khan.
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
          <Brand />
          <Button variant="ghost" size="icon" aria-label="Open sheet index" onClick={() => setOpen(true)}>
            <Menu />
          </Button>
        </header>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-72 gap-6 bg-sidebar p-4">
            <SheetTitle className="sr-only">Sheet index</SheetTitle>
            <Brand />
            <NavLinks onNavigate={() => setOpen(false)} />
            <TitleBlock />
          </SheetContent>
        </Sheet>
        <TopStrip />
        <main className="flex-1 px-4 pb-10 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const current = activeItem(usePathname());
  return (
    <GridBackground
      size={28}
      speed={0}
      reveal={false}
      fade={85}
      color="rgba(23,23,26,0.055)"
      className="-mx-4 mb-6 sm:-mx-6 lg:-mx-8"
    >
      <div className="flex flex-col gap-4 px-4 pt-7 pb-6 sm:px-6 md:flex-row md:items-end md:justify-between lg:px-8">
        <div className="max-w-3xl">
          <div className="sheet-label mb-2 flex items-center gap-2 text-muted-foreground">
            <span className="border border-foreground/70 bg-card px-1.5 py-0.5 text-foreground">{current.sheet}</span>
            {current.label}
          </div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] sm:text-[30px]">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </GridBackground>
  );
}
