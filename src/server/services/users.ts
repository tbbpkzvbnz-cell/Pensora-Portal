import "server-only";
import { and, asc, count, eq, ilike, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { applications, brokerFirms, customers, users } from "../db/schema";
import { assertCan, AuthzError, BROKER_ROLES, can, NotFoundError, ROLES, type Actor, type Role } from "../authz";
import { hashPassword, passwordProblems } from "../auth/password";
import { destroyAllSessions } from "../auth/session";
import { createAndSendResetLink } from "../auth/login";
import { diff, logActivity } from "../audit";
import { normalizePhone } from "@/lib/phone";

export class ValidationError extends Error {
  constructor(message: string, public fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "ValidationError";
  }
}

export function zodFieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) out[String(i.path[0])] ??= i.message;
  return out;
}

const userInput = z.object({
  firstName: z.string().trim().min(1, "Pflichtfeld").max(100),
  lastName: z.string().trim().min(1, "Pflichtfeld").max(100),
  email: z.string().trim().toLowerCase().email("Ungültige E-Mail-Adresse").max(200),
  phone: z.string().trim().transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) ctx.addIssue({ code: "custom", message: "Ungültige Telefonnummer" });
    return p ?? "";
  }),
  role: z.enum(ROLES),
  brokerFirmId: z.string().uuid().nullable().optional(),
});

/** Visible users: GL all, Broker GL own firm. */
function userScope(actor: Actor): SQL {
  const base = isNull(users.deletedAt);
  if (can(actor, "users.manage")) return base;
  if (can(actor, "users.view_own_firm") && actor.brokerFirmId) return and(base, eq(users.brokerFirmId, actor.brokerFirmId))!;
  throw new AuthzError();
}

export async function listUsers(actor: Actor, f: { q?: string; role?: string; brokerFirmId?: string; status?: string } = {}) {
  const conds: SQL[] = [userScope(actor)];
  if (f.q) {
    const like = `%${f.q}%`;
    conds.push(or(ilike(users.firstName, like), ilike(users.lastName, like), ilike(users.email, like), ilike(users.phone, like))!);
  }
  if (f.role && (ROLES as readonly string[]).includes(f.role)) conds.push(eq(users.role, f.role as Role));
  if (f.brokerFirmId === "pensora") conds.push(isNull(users.brokerFirmId));
  else if (f.brokerFirmId) conds.push(eq(users.brokerFirmId, f.brokerFirmId));
  if (f.status === "active" || f.status === "disabled") conds.push(eq(users.status, f.status));
  const custCount = db.$with("cc").as(db.select({ advisorId: customers.advisorId, n: count().as("n") }).from(customers).where(isNull(customers.deletedAt)).groupBy(customers.advisorId));
  return db
    .with(custCount)
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phone: users.phone,
      role: users.role,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
      brokerFirmId: users.brokerFirmId,
      brokerName: brokerFirms.name,
      customerCount: sql<number>`coalesce(${custCount.n}, 0)::int`,
    })
    .from(users)
    .leftJoin(brokerFirms, eq(brokerFirms.id, users.brokerFirmId))
    .leftJoin(custCount, eq(custCount.advisorId, users.id))
    .where(and(...conds))
    .orderBy(asc(users.lastName), asc(users.firstName));
}

export async function getUser(actor: Actor, id: string) {
  const [u] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phone: users.phone,
      role: users.role,
      status: users.status,
      brokerFirmId: users.brokerFirmId,
      brokerName: brokerFirms.name,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(brokerFirms, eq(brokerFirms.id, users.brokerFirmId))
    .where(and(eq(users.id, id), userScope(actor)));
  if (!u) throw new NotFoundError();
  return u;
}

async function validateUser(raw: unknown, excludeId?: string) {
  const parsed = userInput.safeParse(raw);
  if (!parsed.success) throw new ValidationError("Bitte Eingaben prüfen.", zodFieldErrors(parsed.error));
  const d = parsed.data;
  const isBroker = BROKER_ROLES.includes(d.role);
  if (isBroker && !d.brokerFirmId) throw new ValidationError("Bitte Eingaben prüfen.", { brokerFirmId: "Für Broker-Rollen ist eine Brokerfirma erforderlich" });
  if (!isBroker) d.brokerFirmId = null;
  if (d.brokerFirmId) {
    const [b] = await db.select({ id: brokerFirms.id, active: brokerFirms.active }).from(brokerFirms).where(eq(brokerFirms.id, d.brokerFirmId));
    if (!b) throw new ValidationError("Bitte Eingaben prüfen.", { brokerFirmId: "Brokerfirma nicht gefunden" });
  }
  const dupe = await db
    .select({ email: users.email, phone: users.phone })
    .from(users)
    .where(and(or(sql`lower(${users.email}) = ${d.email}`, eq(users.phone, d.phone)), excludeId ? ne(users.id, excludeId) : undefined));
  const fe: Record<string, string> = {};
  if (dupe.some((x) => x.email.toLowerCase() === d.email)) fe.email = "Diese E-Mail-Adresse wird bereits verwendet";
  if (dupe.some((x) => x.phone === d.phone)) fe.phone = "Diese Telefonnummer wird bereits verwendet";
  if (Object.keys(fe).length) throw new ValidationError("Bitte Eingaben prüfen.", fe);
  return d;
}

export async function createUser(actor: Actor, raw: unknown, password: string) {
  assertCan(actor, "users.manage");
  const d = await validateUser(raw);
  const problem = passwordProblems(password);
  if (problem) throw new ValidationError("Bitte Eingaben prüfen.", { password: problem });
  const [u] = await db
    .insert(users)
    .values({ ...d, brokerFirmId: d.brokerFirmId ?? null, passwordHash: await hashPassword(password), passwordChangedAt: new Date() })
    .returning({ id: users.id });
  await logActivity({ actor, action: "user.create", entityType: "user", entityId: u.id, summary: `Benutzer ${d.firstName} ${d.lastName} (${d.role}) erstellt` });
  return u.id;
}

export async function updateUser(actor: Actor, id: string, raw: unknown) {
  assertCan(actor, "users.manage");
  const before = await getUser(actor, id);
  const d = await validateUser(raw, id);
  if (id === actor.id && d.role !== before.role) throw new ValidationError("Sie können Ihre eigene Rolle nicht ändern.");
  if (before.role !== d.role || before.brokerFirmId !== d.brokerFirmId) {
    // Advisors with customers keep customers bound to their firm – prevent silent cross-firm moves.
    const [{ n }] = await db.select({ n: count() }).from(customers).where(and(eq(customers.advisorId, id), isNull(customers.deletedAt)));
    if (n > 0 && before.brokerFirmId !== d.brokerFirmId) {
      throw new ValidationError(`Der Benutzer betreut ${n} Kunden. Bitte die Kunden zuerst einem anderen Berater zuweisen, bevor die Brokerfirma geändert wird.`);
    }
  }
  await db.update(users).set({ ...d, brokerFirmId: d.brokerFirmId ?? null, updatedAt: new Date() }).where(eq(users.id, id));
  if (before.role !== d.role) await destroyAllSessions(id);
  await logActivity({ actor, action: "user.update", entityType: "user", entityId: id, summary: `Benutzer ${d.firstName} ${d.lastName} bearbeitet`, changes: diff(before as Record<string, unknown>, d) });
}

export async function setUserStatus(actor: Actor, id: string, status: "active" | "disabled") {
  assertCan(actor, "users.manage");
  if (id === actor.id) throw new ValidationError("Sie können sich nicht selbst deaktivieren.");
  const u = await getUser(actor, id);
  await db.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, id));
  if (status === "disabled") await destroyAllSessions(id);
  await logActivity({ actor, action: status === "disabled" ? "user.disable" : "user.enable", entityType: "user", entityId: id, summary: `Benutzer ${u.firstName} ${u.lastName} ${status === "disabled" ? "deaktiviert" : "aktiviert"}` });
}

/** Hard delete only without linked business records; otherwise must be deactivated (retention). */
export async function deleteUser(actor: Actor, id: string) {
  assertCan(actor, "users.manage");
  if (id === actor.id) throw new ValidationError("Sie können sich nicht selbst löschen.");
  const u = await getUser(actor, id);
  const [{ c }] = await db.select({ c: count() }).from(customers).where(or(eq(customers.advisorId, id), eq(customers.createdBy, id)));
  const [{ a }] = await db.select({ a: count() }).from(applications).where(or(eq(applications.advisorId, id), eq(applications.createdBy, id)));
  if (c + a > 0) {
    throw new ValidationError("Der Benutzer ist mit Kunden oder Anträgen verknüpft und unterliegt der Aufbewahrungspflicht. Bitte deaktivieren statt löschen.");
  }
  await destroyAllSessions(id);
  // Soft delete + anonymisation keeps audit-log references intact.
  await db
    .update(users)
    .set({ deletedAt: new Date(), status: "disabled", email: `geloescht-${id}@invalid`, phone: `+000${id.replace(/\D/g, "").slice(0, 11)}`, firstName: "Gelöschter", lastName: "Benutzer", passwordHash: "!" })
    .where(eq(users.id, id));
  await logActivity({ actor, action: "user.delete", entityType: "user", entityId: id, summary: `Benutzer ${u.firstName} ${u.lastName} gelöscht (anonymisiert)` });
}

export async function adminResetPassword(actor: Actor, id: string, newPassword?: string) {
  assertCan(actor, "users.manage");
  const [u] = await db.select().from(users).where(and(eq(users.id, id), isNull(users.deletedAt)));
  if (!u) throw new NotFoundError();
  if (newPassword) {
    const problem = passwordProblems(newPassword);
    if (problem) throw new ValidationError(problem, { password: problem });
    await db.update(users).set({ passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null }).where(eq(users.id, id));
    await destroyAllSessions(id);
    await logActivity({ actor, action: "user.password_set", entityType: "user", entityId: id, summary: `Passwort für ${u.firstName} ${u.lastName} neu gesetzt` });
  } else {
    await createAndSendResetLink(u);
    await logActivity({ actor, action: "user.password_reset_link", entityType: "user", entityId: id, summary: `Reset-Link an ${u.firstName} ${u.lastName} gesendet` });
  }
}

export async function changeOwnPassword(actor: Actor, current: string, next: string) {
  const [u] = await db.select().from(users).where(eq(users.id, actor.id));
  const { verifyPassword } = await import("../auth/password");
  if (!(await verifyPassword(u.passwordHash, current))) throw new ValidationError("Das aktuelle Passwort ist falsch.", { current: "Falsch" });
  const problem = passwordProblems(next);
  if (problem) throw new ValidationError(problem, { password: problem });
  await db.update(users).set({ passwordHash: await hashPassword(next), passwordChangedAt: new Date() }).where(eq(users.id, actor.id));
  await logActivity({ actor, action: "user.password_change", entityType: "user", entityId: actor.id, summary: "Eigenes Passwort geändert" });
}

/** Advisors selectable for customer assignment / filters within actor's scope. */
export async function listAdvisorOptions(actor: Actor) {
  const conds: SQL[] = [isNull(users.deletedAt), sql`${users.role} in ('broker_advisor','pensora_advisor','broker_gl','pensora_gl')`];
  if (actor.role === "broker_gl") conds.push(eq(users.brokerFirmId, actor.brokerFirmId ?? "00000000-0000-0000-0000-000000000000"));
  else if (!["pensora_gl", "pensora_backoffice"].includes(actor.role)) conds.push(eq(users.id, actor.id));
  return db
    .select({ id: users.id, name: sql<string>`${users.lastName} || ' ' || ${users.firstName}`, brokerFirmId: users.brokerFirmId, role: users.role, status: users.status })
    .from(users)
    .where(and(...conds))
    .orderBy(asc(users.lastName));
}
