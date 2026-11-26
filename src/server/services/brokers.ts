import "server-only";
import { and, asc, count, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { brokerFirms, customers, users } from "../db/schema";
import { assertCan, AuthzError, can, NotFoundError, type Actor } from "../authz";
import { diff, logActivity } from "../audit";
import { ValidationError, zodFieldErrors } from "./users";

const brokerInput = z.object({
  name: z.string().trim().min(2, "Pflichtfeld").max(200),
  street: z.string().trim().max(200).optional().default(""),
  postalCode: z.string().trim().max(10).optional().default(""),
  city: z.string().trim().max(100).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  email: z.union([z.literal(""), z.string().trim().email("Ungültige E-Mail-Adresse")]).optional().default(""),
});

export async function listBrokers(actor: Actor) {
  const where = can(actor, "brokers.manage") || can(actor, "users.manage") || actor.role === "pensora_backoffice"
    ? undefined
    : actor.brokerFirmId
      ? eq(brokerFirms.id, actor.brokerFirmId)
      : sql`false`;
  const uc = db.$with("uc").as(db.select({ b: users.brokerFirmId, n: count().as("uc_n") }).from(users).where(isNull(users.deletedAt)).groupBy(users.brokerFirmId));
  const cc = db.$with("cc").as(db.select({ b: customers.brokerFirmId, n: count().as("cc_n") }).from(customers).where(isNull(customers.deletedAt)).groupBy(customers.brokerFirmId));
  return db
    .with(uc, cc)
    .select({
      id: brokerFirms.id,
      name: brokerFirms.name,
      city: brokerFirms.city,
      phone: brokerFirms.phone,
      email: brokerFirms.email,
      active: brokerFirms.active,
      userCount: sql<number>`coalesce(${uc.n},0)::int`,
      customerCount: sql<number>`coalesce(${cc.n},0)::int`,
    })
    .from(brokerFirms)
    .leftJoin(uc, eq(uc.b, brokerFirms.id))
    .leftJoin(cc, eq(cc.b, brokerFirms.id))
    .where(where)
    .orderBy(asc(brokerFirms.name));
}

export async function getBroker(actor: Actor, id: string) {
  if (!can(actor, "brokers.manage") && actor.brokerFirmId !== id) throw new NotFoundError();
  const [b] = await db.select().from(brokerFirms).where(eq(brokerFirms.id, id));
  if (!b) throw new NotFoundError();
  return b;
}

async function validate(raw: unknown, excludeId?: string) {
  const p = brokerInput.safeParse(raw);
  if (!p.success) throw new ValidationError("Bitte Eingaben prüfen.", zodFieldErrors(p.error));
  const [dupe] = await db
    .select({ id: brokerFirms.id })
    .from(brokerFirms)
    .where(and(sql`lower(${brokerFirms.name}) = ${p.data.name.toLowerCase()}`, excludeId ? ne(brokerFirms.id, excludeId) : undefined));
  if (dupe) throw new ValidationError("Bitte Eingaben prüfen.", { name: "Eine Brokerfirma mit diesem Namen existiert bereits" });
  return p.data;
}

export async function createBroker(actor: Actor, raw: unknown) {
  assertCan(actor, "brokers.manage");
  const d = await validate(raw);
  const [b] = await db.insert(brokerFirms).values(d).returning({ id: brokerFirms.id });
  await logActivity({ actor, action: "broker.create", entityType: "broker_firm", entityId: b.id, summary: `Brokerfirma ${d.name} erstellt` });
  return b.id;
}

export async function updateBroker(actor: Actor, id: string, raw: unknown) {
  assertCan(actor, "brokers.manage");
  const before = await getBroker(actor, id);
  const d = await validate(raw, id);
  await db.update(brokerFirms).set({ ...d, updatedAt: new Date() }).where(eq(brokerFirms.id, id));
  await logActivity({ actor, action: "broker.update", entityType: "broker_firm", entityId: id, summary: `Brokerfirma ${d.name} bearbeitet`, changes: diff(before as Record<string, unknown>, d) });
}

/** Deactivating a firm also deactivates its users (they lose access immediately). */
export async function setBrokerActive(actor: Actor, id: string, active: boolean) {
  assertCan(actor, "brokers.manage");
  const b = await getBroker(actor, id);
  await db.transaction(async (tx) => {
    await tx.update(brokerFirms).set({ active, updatedAt: new Date() }).where(eq(brokerFirms.id, id));
    if (!active) {
      const affected = await tx.update(users).set({ status: "disabled" }).where(eq(users.brokerFirmId, id)).returning({ id: users.id });
      const { sessions } = await import("../db/schema");
      const { inArray } = await import("drizzle-orm");
      if (affected.length) await tx.delete(sessions).where(inArray(sessions.userId, affected.map((a) => a.id)));
    }
  });
  await logActivity({ actor, action: active ? "broker.enable" : "broker.disable", entityType: "broker_firm", entityId: id, summary: `Brokerfirma ${b.name} ${active ? "aktiviert" : "deaktiviert (inkl. Benutzer)"}` });
}

export function assertBrokerAccess(actor: Actor, brokerFirmId: string | null) {
  if (can(actor, "brokers.manage")) return;
  if (!brokerFirmId || actor.brokerFirmId !== brokerFirmId) throw new AuthzError();
}
