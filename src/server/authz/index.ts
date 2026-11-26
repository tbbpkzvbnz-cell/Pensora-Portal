import "server-only";
import { and, eq, exists, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { applications, customers, rolePermissions } from "../db/schema";
import {
  DEFAULT_GRANTS,
  LOCKED_GL_PERMISSIONS,
  PERMISSIONS,
  ROLE_SCOPE,
  type Permission,
  type Role,
} from "./permissions";

export * from "./permissions";

/** The authenticated user as seen by services. Built only by the session layer. */
export type Actor = {
  id: string;
  role: Role;
  brokerFirmId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  permissions: ReadonlySet<Permission>;
};

export class AuthzError extends Error {
  constructor(message = "Keine Berechtigung für diese Aktion.") {
    super(message);
    this.name = "AuthzError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Datensatz nicht gefunden.") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Effective permissions = defaults overridden by DB rows. */
export async function loadPermissions(role: Role): Promise<Set<Permission>> {
  const set = new Set<Permission>(DEFAULT_GRANTS[role]);
  const rows = await db.select().from(rolePermissions).where(eq(rolePermissions.role, role));
  for (const r of rows) {
    if (!(r.permission in PERMISSIONS)) continue;
    const p = r.permission as Permission;
    if (r.allowed) set.add(p);
    else if (!(role === "pensora_gl" && LOCKED_GL_PERMISSIONS.includes(p))) set.delete(p);
  }
  return set;
}

export function can(actor: Actor, permission: Permission): boolean {
  return actor.permissions.has(permission);
}

export function assertCan(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) throw new AuthzError();
}

/**
 * SQL condition restricting `customers` rows to the actor's data scope (§3.1).
 * MUST be part of every query that reads customer-related data.
 */
export function customerScope(actor: Actor): SQL {
  const notDeleted = isNull(customers.deletedAt);
  switch (ROLE_SCOPE[actor.role]) {
    case "all":
      return notDeleted;
    case "submitted":
      return and(
        notDeleted,
        exists(
          db
            .select({ one: sql`1` })
            .from(applications)
            .where(and(eq(applications.customerId, customers.id), eq(applications.phase, "eingereicht"))),
        ),
      )!;
    case "firm":
      if (!actor.brokerFirmId) return sql`false`;
      return and(notDeleted, eq(customers.brokerFirmId, actor.brokerFirmId))!;
    case "own":
      return and(notDeleted, eq(customers.advisorId, actor.id))!;
    case "none":
    default:
      return sql`false`;
  }
}

/** Scope for application rows (joined with customers). Backoffice only sees submitted applications. */
export function applicationScope(actor: Actor): SQL {
  const base = customerScope(actor);
  if (ROLE_SCOPE[actor.role] === "submitted") return and(base, eq(applications.phase, "eingereicht"))!;
  return base;
}

export function isPensora(actor: Actor) {
  return actor.role.startsWith("pensora_");
}
