import Link from "next/link";
import type { Metadata } from "next";
import { requireActor } from "@/server/auth/session";
import { listApplications } from "@/server/services/applications";
import { listBrokers } from "@/server/services/brokers";
import { listAdvisorOptions } from "@/server/services/users";
import { Badge, EmptyRow, Input, PageHeader, Select, Table, Td, Th, btn } from "@/components/ui";
import { Pagination, SortTh, sp1 } from "@/components/table-nav";
import { ReviewBadge } from "@/components/status-badges";
import { REVIEW_STATUS_LABELS } from "@/lib/labels";
import { formatDate, formatTime } from "@/lib/format";
import { ReviewTabs } from "./tabs";

export const metadata: Metadata = { title: "Überprüfungen & Übermittlungen" };

export default async function ReviewQueuePage({ searchParams }: PageProps<"/pruefung">) {
  const actor = await requireActor("review.access");
  const sp = await searchParams;
  const f = {
    view: "pruefung" as const,
    q: sp1(sp, "q"),
    brokerFirmId: sp1(sp, "broker"),
    advisorId: sp1(sp, "advisor"),
    review: sp1(sp, "status") || undefined,
    from: sp1(sp, "von"),
    to: sp1(sp, "bis"),
    sort: sp1(sp, "sort") || "eingang",
    dir: sp1(sp, "dir") || "asc",
    page: Number(sp1(sp, "page")) || 1,
  };
  const [{ rows, total, page, pageSize }, brokers, advisors] = await Promise.all([listApplications(actor, f), listBrokers(actor), listAdvisorOptions(actor)]);
  const base = "/pruefung";
  return (
    <>
      <PageHeader title="Überprüfungen & Übermittlungen" subtitle="Von Beratern eingereichte Anträge – älteste zuerst" />
      <ReviewTabs active="eingang" />
      <form className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
        <Input name="q" placeholder="Kundenname" defaultValue={f.q} className="lg:col-span-2" />
        <Select name="broker" defaultValue={f.brokerFirmId}>
          <option value="">Alle Brokerfirmen</option>
          <option value="pensora">Pensora (intern)</option>
          {brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select name="advisor" defaultValue={f.advisorId}>
          <option value="">Alle Berater</option>
          {advisors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <Select name="status" defaultValue={f.review}>
          <option value="">Alle offenen Status</option>
          {Object.entries(REVIEW_STATUS_LABELS).filter(([k]) => k !== "uebermittelt").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Input type="date" name="von" defaultValue={f.from} aria-label="Eingang von" title="Eingang von" />
        <div className="flex gap-2"><Input type="date" name="bis" defaultValue={f.to} aria-label="Eingang bis" title="Eingang bis" /><button className={btn.secondary}>Filtern</button></div>
      </form>
      <Table>
        <thead>
          <tr>
            <SortTh base={base} sp={sp} col="name" label="Kunde" defaultSort="eingang" />
            <Th>Berater</Th>
            <Th>Brokerfirma</Th>
            <SortTh base={base} sp={sp} col="eingang" label="Eingangsdatum" defaultSort="eingang" />
            <Th>Zeit</Th>
            <Th>Dokumente</Th>
            <Th>Bearbeitungsstatus</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <EmptyRow cols={7} text="Keine offenen Anträge." />}
          {rows.map((a) => (
            <tr key={a.id} className="hover:bg-surface">
              <Td><Link href={`/pruefung/${a.id}`} className="font-medium text-brand-700 hover:underline">{a.lastName} {a.firstName}</Link></Td>
              <Td>{a.advisorName}</Td>
              <Td>{a.brokerName ?? <span className="text-muted">Pensora</span>}</Td>
              <Td>{formatDate(a.submittedToPensoraAt)}</Td>
              <Td>{formatTime(a.submittedToPensoraAt)}</Td>
              <Td>{a.docsComplete ? <Badge tone="green">Vollständig</Badge> : <Badge tone="amber">Unvollständig</Badge>}</Td>
              <Td><ReviewBadge s={a.reviewStatus} /></Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination base={base} sp={sp} page={page} pageSize={pageSize} total={total} />
    </>
  );
}
