import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { rolePermissions, settings } from "../db/schema";
import { assertCan, DEFAULT_GRANTS, LOCKED_GL_PERMISSIONS, PERMISSIONS, ROLES, type Actor, type Permission, type Role } from "../authz";
import { logActivity } from "../audit";
import { ValidationError } from "./users";

export const SETTING_DEFAULTS = {
  capture_link_hours: 72,
  zentralstelle_recipient: "",
  zentralstelle_subject: "Suchanfrage Freizügigkeitsguthaben – {nachname} {vorname}, {geburtsdatum}",
  zentralstelle_body:
    "Sehr geehrte Damen und Herren\n\nIm Auftrag und mit Vollmacht der untenstehenden Person ersuchen wir Sie um Abklärung allfälliger Guthaben aus der beruflichen Vorsorge.\n\nName: {nachname} {vorname}\nGeburtsdatum: {geburtsdatum}\nAHV-Nr.: {ahv}\n\nDie unterzeichnete Vollmacht samt Kopie des Identitätsnachweises finden Sie im Anhang.\n\nFreundliche Grüsse\nPensora GmbH\nSteinackerstrasse 2, 8302 Kloten",
} as const;
export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting<K extends SettingKey>(key: K): Promise<(typeof SETTING_DEFAULTS)[K] | string | number> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return (row?.value as string | number | undefined) ?? SETTING_DEFAULTS[key];
}

export async function getAllSettings() {
  const rows = await db.select().from(settings);
  const out: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out as { [K in SettingKey]: (typeof SETTING_DEFAULTS)[K] | string | number };
}

const schemas: Record<SettingKey, z.ZodType> = {
  capture_link_hours: z.coerce.number().int().min(1, "Mindestens 1 Stunde").max(720, "Maximal 30 Tage"),
  zentralstelle_recipient: z.union([z.literal(""), z.string().trim().email("Ungültige E-Mail-Adresse")]),
  zentralstelle_subject: z.string().trim().min(3).max(300),
  zentralstelle_body: z.string().trim().min(10).max(5000),
};

export async function saveSettings(actor: Actor, values: Partial<Record<SettingKey, string>>) {
  assertCan(actor, "settings.manage");
  const fe: Record<string, string> = {};
  const parsed: Partial<Record<SettingKey, unknown>> = {};
  for (const [k, v] of Object.entries(values) as [SettingKey, string][]) {
    const r = schemas[k].safeParse(v);
    if (!r.success) fe[k] = r.error.issues[0].message;
    else parsed[k] = r.data;
  }
  if (Object.keys(fe).length) throw new ValidationError("Bitte Eingaben prüfen.", fe);
  for (const [k, v] of Object.entries(parsed)) {
    await db.insert(settings).values({ key: k, value: v, updatedBy: actor.id }).onConflictDoUpdate({ target: settings.key, set: { value: v, updatedBy: actor.id, updatedAt: new Date() } });
  }
  await logActivity({ actor, action: "settings.update", entityType: "settings", summary: `Einstellungen geändert: ${Object.keys(parsed).join(", ")}` });
}

/* ---------------- role permission matrix ---------------- */

export async function getPermissionMatrix() {
  const rows = await db.select().from(rolePermissions);
  const matrix = {} as Record<Role, Record<Permission, boolean>>;
  for (const r of ROLES) {
    matrix[r] = {} as Record<Permission, boolean>;
    for (const p of Object.keys(PERMISSIONS) as Permission[]) matrix[r][p] = DEFAULT_GRANTS[r].includes(p);
  }
  for (const row of rows) if (row.permission in PERMISSIONS) matrix[row.role][row.permission as Permission] = row.allowed;
  for (const p of LOCKED_GL_PERMISSIONS) matrix.pensora_gl[p] = true;
  return matrix;
}

export async function setRolePermission(actor: Actor, role: Role, permission: Permission, allowed: boolean) {
  assertCan(actor, "settings.manage");
  if (!(permission in PERMISSIONS) || !ROLES.includes(role)) throw new ValidationError("Ungültige Berechtigung.");
  if (role === "pensora_gl" && LOCKED_GL_PERMISSIONS.includes(permission)) throw new ValidationError("Diese Berechtigung kann der Pensora GL nicht entzogen werden.");
  await db
    .insert(rolePermissions)
    .values({ role, permission, allowed, updatedBy: actor.id })
    .onConflictDoUpdate({ target: [rolePermissions.role, rolePermissions.permission], set: { allowed, updatedBy: actor.id, updatedAt: new Date() } });
  await logActivity({ actor, action: "permission.update", entityType: "role_permission", summary: `Berechtigung „${PERMISSIONS[permission]}“ für Rolle ${role} ${allowed ? "erteilt" : "entzogen"}` });
}
