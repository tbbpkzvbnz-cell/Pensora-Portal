import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { AuthzError, NotFoundError } from "./authz";
import { ValidationError } from "./services/users";
import { IntegrationInactiveError } from "./integrations/sms";

export function formValues(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !/password/i.test(k)) out[k] = v;
  return out;
}

/** Runs a mutation and converts known errors into user-friendly action state. */
export async function run(fd: FormData | null, fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { success: "Gespeichert." };
  } catch (e) {
    unstable_rethrow(e);
    const values = fd ? formValues(fd) : undefined;
    if (e instanceof ValidationError) return { error: e.message, fieldErrors: e.fieldErrors, values };
    if (e instanceof AuthzError) return { error: e.message, values };
    if (e instanceof NotFoundError) return { error: e.message, values };
    if (e instanceof IntegrationInactiveError) return { error: e.message, values };
    console.error(e);
    return { error: "Ein unerwarteter Fehler ist aufgetreten. Bitte erneut versuchen oder den Administrator informieren.", values };
  }
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}
