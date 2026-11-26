import "server-only";
import { headers } from "next/headers";
import { db, type Tx } from "./db";
import { activityLog, notifications } from "./db/schema";
import type { Actor } from "./authz";

export async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  } catch {
    return null;
  }
}

type LogInput = {
  actor: Actor | null;
  actorLabel?: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  customerId?: string | null;
  summary: string;
  changes?: Record<string, { from: unknown; to: unknown }> | null;
};

export async function logActivity(input: LogInput, tx: Tx | typeof db = db) {
  await tx.insert(activityLog).values({
    actorId: input.actor?.id ?? null,
    actorLabel: input.actorLabel ?? (input.actor ? `${input.actor.firstName} ${input.actor.lastName}` : null),
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    customerId: input.customerId ?? null,
    summary: input.summary,
    changes: input.changes ?? null,
    ip: await clientIp(),
  });
}

/** Field-level diff for audit entries. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(after)) {
    if (after[k] !== undefined && String(before[k] ?? "") !== String(after[k] ?? "")) out[k] = { from: before[k] ?? null, to: after[k] };
  }
  return out;
}

export async function notify(userIds: string[], n: { title: string; body?: string; link?: string }, tx: Tx | typeof db = db) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  await tx.insert(notifications).values(unique.map((userId) => ({ userId, ...n })));
}
