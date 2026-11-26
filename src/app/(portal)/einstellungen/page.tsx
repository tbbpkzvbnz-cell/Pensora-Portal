import type { Metadata } from "next";
import { requireActor } from "@/server/auth/session";
import { ROLE_LABELS } from "@/server/authz";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { Card, DefinitionList, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { SettingsTabs } from "./nav";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  const actor = await requireActor();
  const [u] = await db.select().from(users).where(eq(users.id, actor.id));
  return (
    <>
      <PageHeader title="Einstellungen" />
      <SettingsTabs actor={actor} active="profil" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Mein Konto">
          <DefinitionList
            items={[
              ["Name", `${u.firstName} ${u.lastName}`],
              ["Rolle", ROLE_LABELS[u.role]],
              ["E-Mail", u.email],
              ["Telefon (SMS-2FA)", formatPhone(u.phone)],
              ["Letzte Anmeldung", formatDateTime(u.lastLoginAt)],
              ["Passwort geändert", formatDateTime(u.passwordChangedAt)],
            ]}
          />
          <p className="mt-4 text-xs text-muted">Änderungen an Name, E-Mail oder Telefonnummer nimmt die Pensora GL vor.</p>
        </Card>
        <Card title="Passwort ändern"><PasswordForm /></Card>
      </div>
    </>
  );
}
