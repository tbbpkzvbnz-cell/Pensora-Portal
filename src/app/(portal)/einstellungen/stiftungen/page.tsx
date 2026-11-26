import type { Metadata } from "next";
import { requireActor } from "@/server/auth/session";
import { listFoundations } from "@/server/services/portfolio";
import { Card, EmptyRow, PageHeader, Table, Td, Th } from "@/components/ui";
import { SettingsTabs } from "../nav";
import { FoundationEdit } from "./edit";

export const metadata: Metadata = { title: "Stiftungen" };

export default async function FoundationsPage() {
  const actor = await requireActor("portfolio.edit");
  const rows = await listFoundations();
  return (
    <>
      <PageHeader title="Einstellungen" subtitle="Stammliste der Vorsorge- und Freizügigkeitsstiftungen" />
      <SettingsTabs actor={actor} active="stiftungen" />
      <Card title="Neue Stiftung" className="mb-6"><FoundationEdit /></Card>
      <Table>
        <thead><tr><Th>Name</Th><Th>Adresse</Th><Th></Th></tr></thead>
        <tbody>
          {rows.length === 0 && <EmptyRow cols={3} text="Noch keine Stiftungen erfasst." />}
          {rows.map((f) => (
            <tr key={f.id}><Td className="font-medium">{f.name}</Td><Td>{f.address ?? "–"}</Td><Td className="w-96"><FoundationEdit f={f} /></Td></tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
