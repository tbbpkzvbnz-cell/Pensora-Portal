import type { Metadata } from "next";
import { requireActor } from "@/server/auth/session";
import { getAllSettings } from "@/server/services/settings";
import { Card, PageHeader } from "@/components/ui";
import { SettingsTabs } from "../nav";
import { ZentralstelleForm } from "./form";

export const metadata: Metadata = { title: "Zentralstelle" };

export default async function ZentralstellePage() {
  const actor = await requireActor("settings.manage");
  const s = await getAllSettings();
  return (
    <>
      <PageHeader title="Einstellungen" />
      <SettingsTabs actor={actor} active="zentralstelle" />
      <Card title="Übermittlung an die Zentralstelle 2. Säule & Erfassungslinks">
        <ZentralstelleForm values={{ zentralstelle_recipient: String(s.zentralstelle_recipient), zentralstelle_subject: String(s.zentralstelle_subject), zentralstelle_body: String(s.zentralstelle_body), capture_link_hours: String(s.capture_link_hours) }} />
      </Card>
    </>
  );
}
