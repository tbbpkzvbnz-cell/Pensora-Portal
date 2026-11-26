/** Normalizes Swiss/international numbers to E.164. Returns null if implausible. */
export function normalizePhone(input: string): string | null {
  let s = input.replace(/[\s().\-/]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  else if (s.startsWith("0")) s = "+41" + s.slice(1);
  else if (!s.startsWith("+")) s = "+" + s;
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

export function formatPhone(e164: string): string {
  const m = /^\+41(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  return m ? `+41 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164;
}
