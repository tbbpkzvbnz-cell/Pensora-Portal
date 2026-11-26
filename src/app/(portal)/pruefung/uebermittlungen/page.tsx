import Link from "next/link";
import type { Metadata } from "next";
import { requireActor } from "@/server/auth/session";
import { listApplications } from "@/server/services/applications";
import { EmptyRow, Input, PageHeader, Table, Td, Th, btn } from "@/components/ui";
import { Pagination, SortTh, sp1 } from "@/components/table-nav";
import { OutcomeBadge } from "@/components/status-badges";
import { formatAhv } from "@/lib/ahv";
import { formatDate, formatDateTime } from "@/lib/format";
import { ReviewTabs } from "../tabs";

export const metadata: Metadata = { title: "Übermittlungen" };

export default async function TransmittedPage({ searchParams }: PageProps<"/pruefung/uebermittlungen">) {
  const actor = await requireActor("review.access");
  const sp = await searchParams;
  const f = { view: "uebermittelt" as const, q: sp1(sp, "q"), sort: sp1(sp, "sort") || "uebermittelt", dir: sp1(sp, "dir") || "desc", page: Number(sp1(sp, "page")) || 1 };
  const { rows, total, page, pageSize } = await listApplications(actor, f);
  const base = "/pruefung/uebermittlungen";
  return (
    <>
      <PageHeader title="Überprüfungen & Übermittlungen" subtitle="An die Zentralstelle 2. Säule übermittelte Anträge" />
      <ReviewTabs active="uebermittlungen" />
      <form className="mb-4 flex max-w-md gap-2">
        <Input name="q" placeholder="Kundenname" defaultValue={f.q} />
        <button className={btn.secondary}>Suchen</button>
      </form>
      <Table>
        <thead>
          <tr>
            <SortTh base={base} sp={sp} col="name" label="Kunde" defaultSort="uebermittelt" />
            <Th>Geburtsdatum</Th>
            <Th>AHV-Nr.</Th>
            <Th>Berater</Th>
            <Th>Brokerfirma</Th>
            <SortTh base={base} sp={sp} col="eingang" label="Suchanfrage" defaultSort="uebermittelt" />
            <SortTh base={base} sp={sp} col="uebermittelt" label="An Zentralstelle" defaultSort="uebermittelt" />
            <Th>Status</Th>
            <Th>Dokumente</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <EmptyRow cols={9} text="Noch keine Übermittlungen." />}
          {rows.map((a) => (
            <tr key={a.id} className="hover:bg-surface">
              <Td><Link href={`/pruefung/${a.id}`} className="font-medium text-brand-700 hover:underline">{a.lastName} {a.firstName}</Link></Td>
              <Td className="whitespace-nowrap">{formatDate(a.birthDate)}</Td>
              <Td className="whitespace-nowrap">{formatAhv(a.ahvNumber)}</Td>
              <Td>{a.advisorName}</Td>
              <Td>{a.brokerName ?? <span className="text-muted">Pensora</span>}</Td>
              <Td className="whitespace-nowrap">{formatDateTime(a.submittedToPensoraAt)}</Td>
              <Td className="whitespace-nowrap">{formatDateTime(a.transmittedAt)}</Td>
              <Td><OutcomeBadge s={a.outcomeStatus} /></Td>
              <Td className="whitespace-nowrap">{a.pdfDocumentId && <a className="text-brand-700 hover:underline" href={`/api/dokumente/${a.pdfDocumentId}?download=1`}>PDF</a>}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination base={base} sp={sp} page={page} pageSize={pageSize} total={total} />
    </>
  );
}
