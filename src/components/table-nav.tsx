import Link from "next/link";
import clsx from "clsx";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

type SP = Record<string, string | string[] | undefined>;

export function withParams(base: string, sp: SP, patch: Record<string, string | undefined>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v !== "") u.set(k, v);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === "") u.delete(k);
    else u.set(k, v);
  }
  const s = u.toString();
  return s ? `${base}?${s}` : base;
}

export function SortTh({ base, sp, col, label, defaultSort, className }: { base: string; sp: SP; col: string; label: string; defaultSort?: string; className?: string }) {
  const current = (sp.sort as string) ?? defaultSort;
  const dir = (sp.dir as string) ?? "desc";
  const active = current === col;
  const nextDir = active && dir === "asc" ? "desc" : "asc";
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={clsx("border-b border-line bg-surface px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted", className)} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={withParams(base, sp, { sort: col, dir: nextDir, page: undefined })} className="inline-flex items-center gap-1 hover:text-ink">
        {label}
        <Icon className={clsx("h-3.5 w-3.5", active ? "text-brand-600" : "opacity-40")} aria-hidden />
      </Link>
    </th>
  );
}

export function Pagination({ base, sp, page, pageSize, total }: { base: string; sp: SP; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = (p: number, label: string, disabled: boolean) =>
    disabled ? (
      <span className="rounded-lg border border-line px-3 py-1.5 text-sm text-gray-300">{label}</span>
    ) : (
      <Link href={withParams(base, sp, { page: String(p) })} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-brand-300 hover:bg-brand-50">{label}</Link>
    );
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <span>{from}–{to} von {total.toLocaleString("de-CH")}</span>
      <div className="flex items-center gap-2">
        {link(1, "«", page <= 1)}
        {link(page - 1, "‹ Zurück", page <= 1)}
        <span className="px-2">Seite {page} / {pages}</span>
        {link(page + 1, "Weiter ›", page >= pages)}
        {link(pages, "»", page >= pages)}
      </div>
    </div>
  );
}

export function sp1(sp: SP, key: string): string {
  const v = sp[key];
  return typeof v === "string" ? v : "";
}
