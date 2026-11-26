/**
 * Swiss AHV number (AHVN13): 756.XXXX.XXXX.XC, EAN-13 check digit.
 * Formal validation only – it cannot prove the number is assigned.
 */
export function normalizeAhv(input: string): string {
  return input.replace(/\D/g, "");
}

export function isValidAhv(input: string): boolean {
  const d = normalizeAhv(input);
  if (!/^756\d{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(d[12]);
}

export function formatAhv(input: string): string {
  const d = normalizeAhv(input);
  if (d.length !== 13) return input;
  return `${d.slice(0, 3)}.${d.slice(3, 7)}.${d.slice(7, 11)}.${d.slice(11)}`;
}

export function maskAhv(input: string): string {
  const d = normalizeAhv(input);
  if (d.length !== 13) return "•••";
  return `756.••••.••••.${d.slice(11)}`;
}
