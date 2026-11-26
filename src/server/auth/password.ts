import "server-only";
import { hash, verify } from "@node-rs/argon2";

// Argon2id, OWASP recommended parameters
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 } as const;

export function hashPassword(pw: string) {
  return hash(pw, OPTS);
}

export async function verifyPassword(hashStr: string, pw: string) {
  try {
    return await verify(hashStr, pw);
  } catch {
    return false;
  }
}

export function passwordProblems(pw: string): string | null {
  if (pw.length < 12) return "Das Passwort muss mindestens 12 Zeichen lang sein.";
  if (pw.length > 200) return "Das Passwort ist zu lang.";
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((r) => r.test(pw)).length;
  if (classes < 3) return "Das Passwort muss mindestens drei der folgenden enthalten: Kleinbuchstaben, Grossbuchstaben, Ziffern, Sonderzeichen.";
  return null;
}

/** Dummy hash to keep timing similar for unknown users. */
let dummy: string | null = null;
export async function burnTime(pw: string) {
  dummy ??= await hashPassword("dummy-password-for-timing");
  await verifyPassword(dummy, pw);
}
