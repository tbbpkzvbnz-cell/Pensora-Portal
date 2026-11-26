import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

export { clsx as cx };

export function PageHeader({ title, subtitle, actions, breadcrumb }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; breadcrumb?: { href: string; label: string }[] }) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumb && (
          <nav className="mb-1 flex flex-wrap items-center gap-1 text-sm text-muted">
            {breadcrumb.map((b) => (
              <span key={b.href} className="flex items-center gap-1">
                <Link href={b.href} className="hover:text-brand-600">{b.label}</Link>
                <span aria-hidden>›</span>
              </span>
            ))}
          </nav>
        )}
        <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const btnBase = "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
export const btn = {
  primary: clsx(btnBase, "bg-brand-600 text-white hover:bg-brand-700"),
  secondary: clsx(btnBase, "border border-line bg-white text-ink hover:border-brand-300 hover:bg-brand-50"),
  danger: clsx(btnBase, "border border-red-200 bg-white text-red-700 hover:bg-red-50"),
  ghost: clsx(btnBase, "text-brand-600 hover:bg-brand-50"),
};

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: keyof typeof btn }) {
  return <button className={clsx(btn[variant], className)} {...props} />;
}

export function ButtonLink({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: keyof typeof btn }) {
  return <Link className={clsx(btn[variant], className)} {...props} />;
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("rounded-xl border border-line bg-white", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: ReactNode; hint?: string; href?: string }) {
  const inner = (
    <div className="rounded-xl border border-line bg-white p-4 transition hover:border-brand-300">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-ink tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

const tones = {
  gray: "bg-gray-100 text-gray-700 ring-gray-200",
  violet: "bg-brand-50 text-brand-700 ring-brand-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
};
export type Tone = keyof typeof tones;
export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={clsx("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", tones[tone])}>{children}</span>;
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  );
}
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={clsx("border-b border-line bg-surface px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted", className)}>{children}</th>;
}
export function Td({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={clsx("border-b border-line px-4 py-3 align-middle", className)}>{children}</td>;
}
export function EmptyRow({ cols, text = "Keine Einträge gefunden." }: { cols: number; text?: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-10 text-center text-sm text-muted">{text}</td>
    </tr>
  );
}

export function Field({ label, children, hint, error, required }: { label: string; children: ReactNode; hint?: string; error?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">
        {label}
        {required && <span className="text-brand-600"> *</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export const inputCls =
  "block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-surface";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={clsx(inputCls, props.className)} />;
}
export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={clsx(inputCls, props.className)} />;
}
export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={clsx(inputCls, props.className)} />;
}

export function Alert({ tone = "info", children }: { tone?: "info" | "error" | "success" | "warning"; children: ReactNode }) {
  const cls = {
    info: "border-brand-200 bg-brand-50 text-brand-800",
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
  }[tone];
  return <div role={tone === "error" ? "alert" : "status"} className={clsx("rounded-lg border px-4 py-3 text-sm", cls)}>{children}</div>;
}

export function DefinitionList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">{k}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink">{v ?? "–"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabs({ tabs, active }: { tabs: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={clsx(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
            t.key === active ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
