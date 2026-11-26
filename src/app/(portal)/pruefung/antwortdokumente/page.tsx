import Link from "next/link";
import type { Metadata } from "next";
import { requireActor } from "@/server/auth/session";
import { listApplications } from "@/server/services/applications";
import { EmptyRow, Input, PageHeader, Table, Td, Th, btn } from "@/components/ui";
import { OutcomeBadge } from "@/components/status-badges";
import { sp1 } from "@/components/table-nav";
import { maskAhv } from "@/lib/ahv";
import { formatDate } from "@/lib/format";
import { ReviewTabs } from "../tabs";

export const metadata: Metadata = { title: "Antwortdokumente" };

export default async function ResponsesPage({ searchParams }: PageProps<"/pruefung/antwortdokumente">) {
  const actor = await requireActor("responses.upload");
  const sp = await searchParams;
  const q = sp1(sp, "q");
  const { rows } = q ? await listApplications(actor, { view: "uebermittelt", q, pageSize: 50 }) : { rows: [] };
  return (
    <>
      <PageHeader title="Überprüfungen & Übermittlungen" subtitle="Postalisch eingegangene Antworten der Zentralstelle scannen und dem Kunden zuordnen" />
      <ReviewTabs active="antworten" />
      <p className="mb-3 text-sm text-muted">1. Kunde suchen · 2. Antrag öffnen · 3. PDF hochladen, Eingangsdatum erfassen und Zuordnung mit AHV-Kontrollziffern bestätigen.</p>
      <form className="mb-4 flex max-w-md gap-2">
        <Input name="q" placeholder="Name des Kunden laut Antwortschreiben" defaultValue={q} autoFocus />
        <button className={btn.primary}>Suchen</button>
      </form>
      {q && (
        <Table>
          <thead><tr><Th>Kunde</Th><Th>Geburtsdatum</Th><Th>AHV-Nr.</Th><Th>Übermittelt</Th><Th>Status</Th><Th></Th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={6} text="Kein übermittelter Antrag zu diesem Namen gefunden." />}
            {rows.map((a) => (
              <tr key={a.id} className="hover:bg-surface">
                <Td className="font-medium">{a.lastName} {a.firstName}</Td>
                <Td>{formatDate(a.birthDate)}</Td>
                <Td>{maskAhv(a.ahvNumber)}</Td>
                <Td>{formatDate(a.transmittedAt)}</Td>
                <Td><OutcomeBadge s={a.outcomeStatus} /></Td>
                <Td className="text-right"><Link href={`/pruefung/${a.id}#antwort`} className="text-brand-700 hover:underline">Antwort zuordnen ›</Link></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
