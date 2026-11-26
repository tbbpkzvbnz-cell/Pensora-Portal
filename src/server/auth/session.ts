import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db";
import { sessions, users } from "../db/schema";
import { randomToken, sha256 } from "../lib/crypto";
import { env } from "../env";
import { AuthzError, loadPermissions, type Actor, type Permission } from "../authz";

export const SESSION_COOKIE = "pensora_session";
const IDLE_MINUTES = 30;
const ABSOLUTE_HOURS = 12;
const PENDING_2FA_MINUTES = 10;

const cookieOpts = (expires: Date) => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  expires,
});

/** Creates an unverified session that only allows entering the SMS code. */
export async function createPendingSession(userId: string) {
  const token = randomToken();
  const h = await headers();
  const expiresAt = new Date(Date.now() + PENDING_2FA_MINUTES * 60_000);
  const [s] = await db
    .insert(sessions)
    .values({
      tokenHash: sha256(token),
      userId,
      verified: false,
      expiresAt,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    })
    .returning({ id: sessions.id });
  (await cookies()).set(SESSION_COOKIE, token, cookieOpts(expiresAt));
  return s.id;
}

/** After a correct 2FA code: rotate token (prevents fixation) and mark verified. */
export async function promoteSession(sessionId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + ABSOLUTE_HOURS * 3600_000);
  await db
    .update(sessions)
    .set({ tokenHash: sha256(token), verified: true, expiresAt, lastSeenAt: new Date() })
    .where(eq(sessions.id, sessionId));
  (await cookies()).set(SESSION_COOKIE, token, cookieOpts(expiresAt));
}

async function readSessionRow() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date()), isNull(users.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** Returns the pending (not yet 2FA-verified) session, if any. */
export async function getPendingSession() {
  const row = await readSessionRow();
  if (!row || row.session.verified || row.user.status !== "active") return null;
  return row;
}

/**
 * Current authenticated actor or null. Enforces idle timeout, user status and role activation.
 * Memoized per request.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const row = await readSessionRow();
  if (!row || !row.session.verified) return null;
  const { session, user } = row;
  const idleLimit = new Date(Date.now() - IDLE_MINUTES * 60_000);
  if (session.lastSeenAt < idleLimit || user.status !== "active") {
    await db.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }
  const permissions = await loadPermissions(user.role);
  if (!permissions.has("role.login")) return null;
  // Sliding idle window; throttle writes to once per minute.
  if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, session.id));
  }
  return {
    id: user.id,
    role: user.role,
    brokerFirmId: user.brokerFirmId,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    permissions,
  };
});

/** For pages: redirect to login when unauthenticated, 403-page when missing permission. */
export async function requireActor(permission?: Permission): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (permission && !actor.permissions.has(permission)) redirect("/kein-zugriff");
  return actor;
}

/** For server actions / route handlers: throw instead of redirect. */
export async function actorOrThrow(permission?: Permission): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new AuthzError("Sitzung abgelaufen. Bitte erneut anmelden.");
  if (permission && !actor.permissions.has(permission)) throw new AuthzError();
  return actor;
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
