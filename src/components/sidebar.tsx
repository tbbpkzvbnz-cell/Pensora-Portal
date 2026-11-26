"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { Briefcase, ClipboardCheck, FileText, LayoutDashboard, Menu, Settings, UserCog, Users, X } from "lucide-react";

const ICONS = { LayoutDashboard, Users, FileText, ClipboardCheck, Briefcase, UserCog, Settings } as const;

export function Sidebar({ items, footer }: { items: { href: string; label: string; icon: string }[]; footer: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {items.map((i) => {
        const Icon = ICONS[i.icon as keyof typeof ICONS] ?? LayoutDashboard;
        const active = pathname === i.href || pathname.startsWith(i.href + "/");
        return (
          <Link
            key={i.href}
            href={i.href}
            onClick={() => setOpen(false)}
            className={clsx(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
              active ? "bg-brand-50 text-brand-700" : "text-ink hover:bg-surface",
            )}
          >
            <Icon className={clsx("h-[18px] w-[18px] shrink-0", active ? "text-brand-600" : "text-muted")} aria-hidden />
            <span className="leading-tight">{i.label}</span>
          </Link>
        );
      })}
    </nav>
  );
  return (
    <>
      <button className="fixed left-3 top-3 z-40 rounded-lg border border-line bg-white p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Menü öffnen">
        <Menu className="h-5 w-5" />
      </button>
      {open && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-white py-5 transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-6 flex items-center justify-between px-6">
          <Link href="/dashboard"><Image src="/pensora-logo.png" alt="Pensora" width={130} height={42} priority /></Link>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Menü schliessen"><X className="h-5 w-5" /></button>
        </div>
        {nav}
        <div className="border-t border-line px-3 pt-4">{footer}</div>
      </aside>
    </>
  );
}
