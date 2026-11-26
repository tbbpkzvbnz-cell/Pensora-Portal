const TZ = "Europe/Zurich";

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "–";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}.${m}.${y}`;
  }
  return new Intl.DateTimeFormat("de-CH", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "–";
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "–";
  return new Intl.DateTimeFormat("de-CH", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function formatChf(value: string | number | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  return "CHF " + new Intl.NumberFormat("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

/** Today's date in Zurich as YYYY-MM-DD */
export function todayZurich(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function ageFrom(birthDate: string): number {
  const [y, m, d] = birthDate.split("-").map(Number);
  const [ty, tm, td] = todayZurich().split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}
