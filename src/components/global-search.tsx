"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useEffect, useRef } from "react";

export function GlobalSearch() {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const sp = useSearchParams();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form
      role="search"
      className="relative w-full max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        const q = ref.current?.value.trim();
        if (q) router.push(`/suche?q=${encodeURIComponent(q)}`);
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        ref={ref}
        name="q"
        defaultValue={sp.get("q") ?? ""}
        placeholder="Kunden oder Anträge suchen…  (Ctrl + K)"
        className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
        aria-label="Globale Suche"
      />
    </form>
  );
}
