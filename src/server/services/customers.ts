import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "../db";
import { applications, brokerFirms, customers, documents, users } from "../db/schema";
import { ADVISOR_ROLES, assertCan, AuthzError, can, customerScope, NotFoundError, type Actor } from "../authz";
import { diff, logActivity } from "../audit";
import { ValidationError, zodFieldErrors } from "./users";
import { isValidAhv, normalizeAhv } from "@/lib/ahv";
import { normalizePhone } from "@/lib/phone";
import { todayZurich } from "@/lib/format";
import type { IntakeStatus } from "@/lib/labels";

export const REQUIRED_DOCS = ["id_front", "id_back", "signature"] as const;

const customerInput = z.object({
  firstName: z.string().trim().min(1, "Pflichtfeld").max(100),
  lastName: z.string().trim().min(1, "Pflichtfeld").max(100),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum")
    .refine((d) => d > "1900-01-01" && d < todayZurich(), "Ungültiges Geburtsdatum"),
  ahvNumber: z
    .string()
    .trim()
    .refine(isValidAhv, "Ungültige AHV-Nummer (Format 756.XXXX.XXXX.XX, Prüfziffer)")
    .transform(normalizeAhv),
  street: z.string().trim().min(1, "Pflichtfeld").max(200),
  postalCode: z.string().trim().regex(/^\d{4,5}$/, "Ungültige PLZ"),
  city: z.string().trim().min(1, "Pflichtfeld").max(100),
  phone: z.string().trim().transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) ctx.addIssue({ code: "custom", message: "Ungültige Telefonnummer" });
    return p ?? "";
  }),
  email: z.string().trim().toLowerCase().email("Ungültige E-Mail-Adresse").max(200),
});
export type CustomerInput = z.input<typeof customerInput>;

/* ----------------------------- reads ----------------------------- */

const docFlags = () => {
  const has = (t: string) =>
    sql<boolean>`exists (select 1 from ${documents} d where d.customer_id = ${customers.id} and d.type = ${t} and d.deleted_at is null and d.superseded_at is null)`;
  return { hasIdFront: has("id_front"), hasIdBack: has("id_back"), hasSignature: has("signature") };
};

const latestApp = sql`(select a.id from ${applications} a where a.customer_id = ${customers.id} order by a.created_at desc limit 1)`;

export const CUSTOMER_SORT = {
  name: [customers.lastName, customers.firstName],
  geburtsdatum: [customers.birthDate],
  erfasst: [customers.createdAt],
  status: [customers.intakeStatus],
} as const;

export type CustomerFilter = {
  q?: string;
  brokerFirmId?: string;
  advisorId?: string;
  status?: string;
  sort?: string;
  dir?: string;
  page?: number;
  pageSize?: number;
};

function filterConds(actor: Actor, f: CustomerFilter): SQL[] {
  const conds: SQL[] = [customerScope(actor)];
  if (f.q) {
    const q = f.q.trim();
    const like = `%${q}%`;
    const digits = q.replace(/\D/g, "");
    const or_: SQL[] = [
      ilike(customers.firstName, like),
      ilike(customers.lastName, like),
      sql`(${customers.firstName} || ' ' || ${customers.lastName}) ilike ${like}`,
      sql`(${customers.lastName} || ' ' || ${customers.firstName}) ilike ${like}`,
      ilike(customers.email, like),
    ];
    if (digits.length >= 4) {
      or_.push(sql`${customers.phone} like ${"%" + digits + "%"}`);
      if (actor.role === "pensora_gl" || actor.role === "pensora_backoffice") or_.push(sql`${customers.ahvNumber} like ${"%" + digits + "%"}`);
    }
    conds.push(or(...or_)!);
  }
  if (f.brokerFirmId === "pensora") conds.push(isNull(customers.brokerFirmId));
  else if (f.brokerFirmId) conds.push(eq(customers.brokerFirmId, f.brokerFirmId));
  if (f.advisorId) conds.push(eq(customers.advisorId, f.advisorId));
  if (f.status && ["neu_erfasst", "unterlagen_unvollstaendig", "bereit_zur_antragstellung", "antrag_eingereicht"].includes(f.status)) {
    conds.push(eq(customers.intakeStatus, f.status as IntakeStatus));
  }
  return conds;
}

export async function listCustomers(actor: Actor, f: CustomerFilter = {}) {
  assertCan(actor, "customers.view");
  const pageSize = Math.min(Math.max(f.pageSize ?? 25, 10), 5000);
  const page = Math.max(f.page ?? 1, 1);
  const conds = filterConds(actor, f);
  const sortCols = CUSTOMER_SORT[(f.sort ?? "erfasst") as keyof typeof CUSTOMER_SORT] ?? CUSTOMER_SORT.erfasst;
  const dirFn = f.dir === "asc" ? asc : desc;
  const advisor = db.$with("adv").as(db.select({ id: users.id, name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`.as("adv_name") }).from(users));
  const [rows, [{ total }]] = await Promise.all([
    db
      .with(advisor)
      .select({
        id: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        birthDate: customers.birthDate,
        phone: customers.phone,
        email: customers.email,
        city: customers.city,
        intakeStatus: customers.intakeStatus,
        createdAt: customers.createdAt,
        advisorId: customers.advisorId,
        advisorName: advisor.name,
        brokerName: brokerFirms.name,
        reviewStatus: sql<string | null>`(select a.review_status from ${applications} a where a.id = ${latestApp})`,
        outcomeStatus: sql<string | null>`(select a.outcome_status from ${applications} a where a.id = ${latestApp})`,
        ...docFlags(),
      })
      .from(customers)
      .leftJoin(advisor, eq(advisor.id, customers.advisorId))
      .leftJoin(brokerFirms, eq(brokerFirms.id, customers.brokerFirmId))
      .where(and(...conds))
      .orderBy(...sortCols.map((c) => dirFn(c)), asc(customers.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(customers).where(and(...conds)),
  ]);
  return { rows, total, page, pageSize };
}

export async function getCustomer(actor: Actor, id: string) {
  assertCan(actor, "customers.view");
  if (!z.string().uuid().safeParse(id).success) throw new NotFoundError();
  const advisor = db.$with("adv").as(db.select({ id: users.id, name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`.as("adv_name"), phone: users.phone, email: users.email }).from(users));
  const [c] = await db
    .with(advisor)
    .select({ customer: customers, advisorName: advisor.name, advisorEmail: advisor.email, advisorPhone: advisor.phone, brokerName: brokerFirms.name, ...docFlags() })
    .from(customers)
    .leftJoin(advisor, eq(advisor.id, customers.advisorId))
    .leftJoin(brokerFirms, eq(brokerFirms.id, customers.brokerFirmId))
    .where(and(eq(customers.id, id), customerScope(actor)));
  if (!c) throw new NotFoundError();
  return c;
}

/** Throws NotFound when the customer is outside the actor's scope. */
export async function assertCustomerAccess(actor: Actor, id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new NotFoundError();
  const [c] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, id), customerScope(actor)));
  if (!c) throw new NotFoundError();
}

/* ----------------------------- writes ----------------------------- */

async function resolveAdvisor(actor: Actor, advisorId: string | null | undefined) {
  if (ADVISOR_ROLES.includes(actor.role)) return { id: actor.id, brokerFirmId: actor.brokerFirmId };
  if (actor.role !== "pensora_gl") throw new AuthzError();
  if (!advisorId) throw new ValidationError("Bitte Eingaben prüfen.", { advisorId: "Bitte Berater wählen" });
  const [a] = await db.select({ id: users.id, brokerFirmId: users.brokerFirmId, role: users.role, status: users.status }).from(users).where(and(eq(users.id, advisorId), isNull(users.deletedAt)));
  if (!a || !["broker_advisor", "pensora_advisor", "pensora_gl", "broker_gl"].includes(a.role)) {
    throw new ValidationError("Bitte Eingaben prüfen.", { advisorId: "Ungültiger Berater" });
  }
  return { id: a.id, brokerFirmId: a.brokerFirmId };
}

async function assertNoDuplicate(ahv: string, excludeId?: string) {
  const [dupe] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.ahvNumber, ahv), excludeId ? sql`${customers.id} <> ${excludeId}` : undefined));
  if (dupe) {
    // Do not disclose who owns the existing record (see open question #6).
    throw new ValidationError("Ein Kunde mit dieser AHV-Nummer ist bereits im System erfasst. Bitte wenden Sie sich an Pensora.", { ahvNumber: "Bereits erfasst" });
  }
}

export async function findPossibleDuplicates(actor: Actor, firstName: string, lastName: string, birthDate: string) {
  // Name + birth date warning is limited to the actor's own scope to avoid leaking data.
  return db
    .select({ id: customers.id, firstName: customers.firstName, lastName: customers.lastName })
    .from(customers)
    .where(and(customerScope(actor), sql`lower(${customers.firstName}) = ${firstName.toLowerCase()}`, sql`lower(${customers.lastName}) = ${lastName.toLowerCase()}`, eq(customers.birthDate, birthDate)))
    .limit(5);
}

export async function createCustomer(actor: Actor, raw: unknown, advisorId?: string | null) {
  assertCan(actor, "customers.create");
  const p = customerInput.safeParse(raw);
  if (!p.success) throw new ValidationError("Bitte Eingaben prüfen.", zodFieldErrors(p.error));
  const advisor = await resolveAdvisor(actor, advisorId);
  await assertNoDuplicate(p.data.ahvNumber);
  try {
    const [c] = await db
      .insert(customers)
      .values({ ...p.data, advisorId: advisor.id, brokerFirmId: advisor.brokerFirmId, createdBy: actor.id, intakeStatus: "neu_erfasst" })
      .returning({ id: customers.id });
    await logActivity({ actor, action: "customer.create", entityType: "customer", entityId: c.id, customerId: c.id, summary: `Kunde ${p.data.firstName} ${p.data.lastName} erfasst` });
    return c.id;
  } catch (e) {
    if (String((e as { code?: string }).code) === "23505") await assertNoDuplicate(p.data.ahvNumber);
    throw e;
  }
}

export async function updateCustomer(actor: Actor, id: string, raw: unknown) {
  assertCan(actor, "customers.edit");
  const { customer: before } = await getCustomer(actor, id);
  if (before.intakeStatus === "antrag_eingereicht" && !can(actor, "customers.edit_after_submission")) {
    throw new AuthzError("Nach der Übergabe an Pensora können Stammdaten nur noch durch Pensora geändert werden.");
  }
  const p = customerInput.safeParse(raw);
  if (!p.success) throw new ValidationError("Bitte Eingaben prüfen.", zodFieldErrors(p.error));
  if (p.data.ahvNumber !== before.ahvNumber) await assertNoDuplicate(p.data.ahvNumber, id);
  const changes = diff(before as unknown as Record<string, unknown>, p.data);
  if (Object.keys(changes).length === 0) return;
  await db.update(customers).set({ ...p.data, updatedAt: new Date() }).where(eq(customers.id, id));
  await logActivity({ actor, action: "customer.update", entityType: "customer", entityId: id, customerId: id, summary: `Stammdaten geändert (${Object.keys(changes).join(", ")})`, changes });
}

export async function reassignCustomer(actor: Actor, id: string, advisorId: string) {
  assertCan(actor, "customers.reassign");
  const { customer: before, advisorName } = await getCustomer(actor, id);
  const advisor = await resolveAdvisor({ ...actor, role: "pensora_gl" }, advisorId);
  await db.update(customers).set({ advisorId: advisor.id, brokerFirmId: advisor.brokerFirmId, updatedAt: new Date() }).where(eq(customers.id, id));
  const [n] = await db.select({ name: sql<string>`${users.firstName} || ' ' || ${users.lastName}` }).from(users).where(eq(users.id, advisor.id));
  await logActivity({
    actor,
    action: "customer.reassign",
    entityType: "customer",
    entityId: id,
    customerId: id,
    summary: `Berater geändert: ${advisorName} → ${n.name}`,
    changes: { advisorId: { from: before.advisorId, to: advisor.id }, brokerFirmId: { from: before.brokerFirmId, to: advisor.brokerFirmId } },
  });
}

/** Derives the intake marker from documents and applications (§4.3). */
export async function recomputeIntakeStatus(customerId: string, tx: Tx | typeof db = db) {
  const [c] = await tx.select({ s: customers.intakeStatus }).from(customers).where(eq(customers.id, customerId));
  if (!c) return;
  const [{ submitted }] = await tx
    .select({ submitted: count() })
    .from(applications)
    .where(and(eq(applications.customerId, customerId), eq(applications.phase, "eingereicht")));
  const docs = await tx
    .select({ type: documents.type })
    .from(documents)
    .where(and(eq(documents.customerId, customerId), isNull(documents.deletedAt), isNull(documents.supersededAt), inArray(documents.type, [...REQUIRED_DOCS])));
  const [{ apps }] = await tx.select({ apps: count() }).from(applications).where(eq(applications.customerId, customerId));
  const types = new Set(docs.map((d) => d.type));
  let next: IntakeStatus;
  if (submitted > 0) next = "antrag_eingereicht";
  else if (REQUIRED_DOCS.every((t) => types.has(t))) next = "bereit_zur_antragstellung";
  else if (types.size > 0 || apps > 0) next = "unterlagen_unvollstaendig";
  else next = "neu_erfasst";
  if (next !== c.s) {
    await tx.update(customers).set({ intakeStatus: next, updatedAt: new Date() }).where(eq(customers.id, customerId));
  }
}
