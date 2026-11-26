import type { Metadata } from "next";
import { requireActor } from "@/server/auth/session";
import { smsState } from "@/server/integrations/sms";
import { emailState } from "@/server/integrations/email";
import { storageState } from "@/server/integrations/storage";
import { Badge, Card, PageHeader } from "@/components/ui";
import { SettingsTabs } from "../nav";

export const metadata: Metadata = { title: "Integrationen" };

export default async function IntegrationsPage() {
  const actor = await requireActor("settings.manage");
  const items = [
    { ...smsState(), use: "SMS-2FA beim Login, Versand des Erfassungslinks, Passwort-Reset (Fallback)", env: "SMS_PROVIDER (twilio | aspsms), TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN oder ASPSMS_USER_KEY/ASPSMS_PASSWORD, SMS_SENDER" },
    { ...emailState(), use: "Übermittlung an die Zentralstelle 2. Säule, Passwort-Reset", env: "SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM" },
    { ...storageState(), use: "Verschlüsselte Ablage von Vollmachten, ID-Kopien, Unterschriften, Antwortdokumenten", env: "STORAGE_PROVIDER (local | s3), S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, DOCUMENT_ENCRYPTION_KEY" },
  ];
  return (
    <>
      <PageHeader title="Einstellungen" subtitle="Externe Schnittstellen. Anbieter sind austauschbar; Zugangsdaten werden als Umgebungsvariablen auf dem Server hinterlegt, nicht in der Datenbank." />
      <SettingsTabs actor={actor} active="integrationen" />
      <div className="grid gap-6 lg:grid-cols-3">
        {items.map((i) => (
          <Card key={i.name} title={i.name} actions={<Badge tone={i.mode === "aktiv" ? "green" : i.mode === "Entwicklungsmodus" ? "amber" : "red"}>{i.mode === "aktiv" ? "Aktiv" : i.mode === "Entwicklungsmodus" ? "Entwicklungsmodus" : "Nicht aktiv"}</Badge>}>
            <p className="text-sm">{i.detail}</p>
            <p className="mt-3 text-xs text-muted"><strong>Verwendung:</strong> {i.use}</p>
            <p className="mt-2 break-words text-xs text-muted"><strong>Konfiguration:</strong> {i.env}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
