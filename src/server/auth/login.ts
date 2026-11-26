import "server-only";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { otpChallenges, passwordResetTokens, sessions, users } from "../db/schema";
import { numericCode, randomToken, sha256, safeEqualHex } from "../lib/crypto";
import { normalizePhone } from "@/lib/phone";
import { burnTime, hashPassword, passwordProblems, verifyPassword } from "./password";
import { hit } from "./rate-limit";
import { createPendingSession, destroyAllSessions, getPendingSession, promoteSession } from "./session";
import { IntegrationInactiveError, sendSms } from "../integrations/sms";
import { getEmailProvider } from "../integrations/email";
import { clientIp, logActivity } from "../audit";
import { loadPermissions } from "../authz";
import { env } from "../env";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const OTP_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const RESET_MINUTES = 30;

export type LoginResult = { ok: true } | { ok: false; error: string };
const GENERIC = "E-Mail/Telefonnummer oder Passwort ist falsch.";

async function findUserByIdentifier(identifier: string) {
  const id = identifier.trim();
  if (id.includes("@")) {
    const [u] = await db.select().from(users).where(and(sql`lower(${users.email}) = ${id.toLowerCase()}`, isNull(users.deletedAt))).limit(1);
    return u ?? null;
  }
  const phone = normalizePhone(id);
  if (!phone) return null;
  const [u] = await db.select().from(users).where(and(eq(users.phone, phone), isNull(users.deletedAt))).limit(1);
  return u ?? null;
}

async function issueOtp(sessionId: string, phone: string) {
  const code = numericCode(6);
  await db.update(otpChallenges).set({ consumedAt: new Date() }).where(and(eq(otpChallenges.sessionId, sessionId), isNull(otpChallenges.consumedAt)));
  await db.insert(otpChallenges).values({
    sessionId,
    purpose: "login",
    codeHash: sha256(code),
    expiresAt: new Date(Date.now() + OTP_MINUTES * 60_000),
  });
  await sendSms(phone, `Ihr Pensora-Anmeldecode: ${code}. Gültig ${OTP_MINUTES} Minuten. Geben Sie diesen Code niemals weiter.`);
}

/** Step 1: identifier + password → SMS code. */
export async function startLogin(identifier: string, password: string): Promise<LoginResult> {
  const ip = (await clientIp()) ?? "unknown";
  if (!(await hit(`login-ip:${ip}`, 30, 900))) return { ok: false, error: "Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen." };

  const user = await findUserByIdentifier(identifier);
  if (!user) {
    await burnTime(password);
    return { ok: false, error: GENERIC };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, error: "Das Konto ist wegen zu vieler Fehlversuche vorübergehend gesperrt. Bitte später erneut versuchen." };
  }
  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    const failed = user.failedLogins + 1;
    await db
      .update(users)
      .set({ failedLogins: failed >= MAX_FAILED ? 0 : failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
      .where(eq(users.id, user.id));
    await logActivity({ actor: null, actorLabel: identifier.slice(0, 100), action: "auth.login_failed", entityType: "user", entityId: user.id, summary: "Fehlgeschlagene Anmeldung" });
    return { ok: false, error: GENERIC };
  }
  if (user.status !== "active") return { ok: false, error: "Dieses Konto ist deaktiviert. Bitte wenden Sie sich an Pensora." };
  const perms = await loadPermissions(user.role);
  if (!perms.has("role.login")) return { ok: false, error: "Ihre Benutzerrolle ist noch nicht freigeschaltet." };

  await db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
  const sessionId = await createPendingSession(user.id);
  try {
    await issueOtp(sessionId, user.phone);
  } catch (e) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    if (e instanceof IntegrationInactiveError) return { ok: false, error: "Die SMS-Verifizierung ist noch nicht aktiv. Anmeldung derzeit nicht möglich – bitte Administrator kontaktieren." };
    console.error("SMS send failed", e);
    return { ok: false, error: "Der SMS-Code konnte nicht versendet werden. Bitte erneut versuchen." };
  }
  return { ok: true };
}

/** Step 2: SMS code → full session. */
export async function verifyLoginCode(code: string): Promise<LoginResult> {
  const pending = await getPendingSession();
  if (!pending) return { ok: false, error: "Die Anmeldung ist abgelaufen. Bitte erneut anmelden." };
  const [challenge] = await db
    .select()
    .from(otpChallenges)
    .where(and(eq(otpChallenges.sessionId, pending.session.id), isNull(otpChallenges.consumedAt), gt(otpChallenges.expiresAt, new Date())))
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1);
  if (!challenge) return { ok: false, error: "Der Code ist abgelaufen. Bitte neuen Code anfordern." };
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, error: "Zu viele Fehlversuche. Bitte erneut anmelden." };

  const clean = code.replace(/\D/g, "");
  if (!safeEqualHex(sha256(clean), challenge.codeHash)) {
    await db.update(otpChallenges).set({ attempts: challenge.attempts + 1 }).where(eq(otpChallenges.id, challenge.id));
    if (challenge.attempts + 1 >= OTP_MAX_ATTEMPTS) await db.delete(sessions).where(eq(sessions.id, pending.session.id));
    return { ok: false, error: "Der Code ist falsch." };
  }
  await db.update(otpChallenges).set({ consumedAt: new Date() }).where(eq(otpChallenges.id, challenge.id));
  await promoteSession(pending.session.id);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, pending.user.id));
  await logActivity({
    actor: null,
    actorLabel: `${pending.user.firstName} ${pending.user.lastName}`,
    action: "auth.login",
    entityType: "user",
    entityId: pending.user.id,
    summary: "Anmeldung mit SMS-Verifizierung",
  });
  return { ok: true };
}

export async function resendLoginCode(): Promise<LoginResult> {
  const pending = await getPendingSession();
  if (!pending) return { ok: false, error: "Die Anmeldung ist abgelaufen. Bitte erneut anmelden." };
  if (!(await hit(`otp-resend:${pending.session.id}`, 3, 600))) return { ok: false, error: "Zu viele Code-Anforderungen. Bitte erneut anmelden." };
  try {
    await issueOtp(pending.session.id, pending.user.phone);
    return { ok: true };
  } catch {
    return { ok: false, error: "Der SMS-Code konnte nicht versendet werden." };
  }
}

export function maskedPhone(phone: string) {
  return phone.slice(0, 4) + " •• ••• " + phone.slice(-4, -2) + " " + phone.slice(-2);
}

/* ---------------- Password reset ---------------- */

/** Always answers the same way, to not reveal whether an account exists. */
export async function requestPasswordReset(identifier: string): Promise<void> {
  const ip = (await clientIp()) ?? "unknown";
  if (!(await hit(`pwreset-ip:${ip}`, 5, 3600))) return;
  const user = await findUserByIdentifier(identifier);
  if (!user || user.status !== "active") return;
  await createAndSendResetLink(user);
}

export async function createAndSendResetLink(user: { id: string; email: string; phone: string; firstName: string }) {
  const token = randomToken();
  await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000) });
  const link = `${env.APP_URL}/passwort-zuruecksetzen/${token}`;
  const email = getEmailProvider();
  if (email) {
    await email.send({
      to: user.email,
      subject: "Pensora-Portal: Passwort zurücksetzen",
      text: `Guten Tag ${user.firstName}\n\nÜber folgenden Link können Sie Ihr Passwort zurücksetzen (gültig ${RESET_MINUTES} Minuten):\n${link}\n\nFalls Sie dies nicht angefordert haben, ignorieren Sie diese Nachricht.\n\nPensora GmbH`,
    });
  } else {
    await sendSms(user.phone, `Pensora: Passwort zurücksetzen (${RESET_MINUTES} Min. gültig): ${link}`);
  }
  await logActivity({ actor: null, action: "auth.password_reset_requested", entityType: "user", entityId: user.id, summary: "Passwort-Reset angefordert" });
}

export async function validateResetToken(token: string) {
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.tokenHash, sha256(token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function resetPassword(token: string, password: string): Promise<LoginResult> {
  const row = await validateResetToken(token);
  if (!row) return { ok: false, error: "Der Link ist ungültig oder abgelaufen." };
  const problem = passwordProblems(password);
  if (problem) return { ok: false, error: problem };
  await db.transaction(async (tx) => {
    await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.userId, row.userId));
    await tx.update(users).set({ passwordHash: await hashPassword(password), passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null }).where(eq(users.id, row.userId));
  });
  await destroyAllSessions(row.userId);
  await logActivity({ actor: null, action: "auth.password_reset", entityType: "user", entityId: row.userId, summary: "Passwort über Reset-Link geändert" });
  return { ok: true };
}
