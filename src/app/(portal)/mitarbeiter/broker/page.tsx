import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { listBrokers } from "@/server/services/brokers";
import { Badge, ButtonLink, EmptyRow, PageHeader, Table, Td, Th } from "@/components/ui";
import { StaffTabs } from "../tabs";

export default async function BrokersPage() {
  const actor = await requireActor("brokers.manage");
  const rows = await listBrokers(actor);
  return (
    <>
      <PageHeader title="Mitarbeiterverwaltung" subtitle="Externe Brokerfirmen" actions={<ButtonLink href="/mitarbeiter/broker/neu">Neue Brokerfirma</ButtonLink>} />
      <StaffTabs active="brokers" showBrokers />
      <Table>
        <thead><tr><Th>Firma</Th><Th>Ort</Th><Th>Telefon</Th><Th>E-Mail</Th><Th className="text-right">Benutzer</Th><Th className="text-right">Kunden</Th><Th>Status</Th></tr></thead>
        <tbody>
          {rows.length === 0 && <EmptyRow cols={7} text="Noch keine Brokerfirmen erfasst." />}
          {rows.map((b) => (
            <tr key={b.id} className="hover:bg-surface">
              <Td><Link href={`/mitarbeiter/broker/${b.id}`} className="font-medium text-brand-700 hover:underline">{b.name}</Link></Td>
              <Td>{b.city || "–"}</Td>
              <Td>{b.phone || "–"}</Td>
              <Td>{b.email || "–"}</Td>
              <Td className="text-right tabular-nums"><Link className="hover:underline" href={`/mitarbeiter?broker=${b.id}`}>{b.userCount}</Link></Td>
              <Td className="text-right tabular-nums"><Link className="hover:underline" href={`/kunden?broker=${b.id}`}>{b.customerCount}</Link></Td>
              <Td>{b.active ? <Badge tone="green">Aktiv</Badge> : <Badge>Inaktiv</Badge>}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
