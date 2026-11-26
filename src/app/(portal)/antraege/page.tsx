import Link from "next/link";
import type { Metadata } from "next";
import { requireActor } from "@/server/auth/session";
import { can } from "@/server/authz";
import { listApplications } from "@/server/services/applications";
import { listBrokers } from "@/server/services/brokers";
import { listAdvisorOptions } from "@/server/services/users";
import { EmptyRow, Input, PageHeader, Select, Table, Tabs, Td, Th, btn } from "@/components/ui";
import { Pagination, SortTh, sp1, withParams } from "@/components/table-nav";
import { ApplicationStatus } from "@/components/status-badges";
import { OUTCOME_STATUS_LABELS } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";

export const metadata: Metadata = { title: "Anträge" };

export default async function ApplicationsPage({ searchParams }: PageProps<"/antraege">) {
  const actor = await requireActor("applications.view");
  const sp = await searchParams;
  const view = sp1(sp, "ansicht") === "alle" ? "alle" : "eingereicht";
  const isGl = actor.role === "pensora_gl" || actor.role === "pensora_backoffice";
  const f = {
    view: view as "alle" | "eingereicht",
    q: sp1(sp, "q"),
    brokerFirmId: isGl ? sp1(sp, "broker") : undefined,
    advisorId: actor.role.endsWith("advisor") ? undefined : sp1(sp, "advisor"),
    outcome: sp1(sp, "status") || undefined,
    from: isGl ? sp1(sp, "von") : undefined,
    to: isGl ? sp1(sp, "bis") : undefined,
    sort: sp1(sp, "sort"),
    dir: sp1(sp, "dir"),
    page: Number(sp1(sp, "page")) || 1,
  };
  const [{ rows, total, page, pageSize }, brokers, advisors] = await Promise.all([
    listApplications(actor, f),
    isGl ? listBrokers(actor) : Promise.resolve([]),
    actor.role === "pensora_gl" || actor.role === "broker_gl" || actor.role === "pensora_backoffice" ? listAdvisorOptions(actor) : Promise.resolve([]),
  ]);
  const base = "/antraege";
  return (
    <>
      <PageHeader
        title="Anträge"
        subtitle="Freizügigkeitsanfragen und deren Bearbeitungsstatus"
        actions={can(actor, "export.data") && <a className={btn.secondary} href={withParams("/api/export/antraege", sp, { page: undefined })}>Export CSV</a>}
      />
      <Tabs
        active={view}
        tabs={[
          { key: "eingereicht", href: "/antraege", label: "Eingereichte Anträge" },
          { key: "alle", href: "/antraege?ansicht=alle", label: "Alle inkl. in Erfassung" },
        ]}
      />
      <form className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {view === "alle" && <input type="hidden" name="ansicht" value="alle" />}
        <Input name="q" placeholder="Kundenname" defaultValue={f.q} className="lg:col-span-2" />
        {isGl && (
          <Select name="broker" defaultValue={f.brokerFirmId}>
            <option value="">Alle Brokerfirmen</option>
            <option value="pensora">Pensora (intern)</option>
            {brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
        {advisors.length > 0 && (
          <Select name="advisor" defaultValue={f.advisorId}>
            <option value="">{actor.role === "broker_gl" ? "Alle Mitarbeiter" : "Alle Berater"}</option>
            {advisors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        )}
        <Select name="status" defaultValue={f.outcome}>
          <option value="">Alle Status</option>
          {Object.entries(OUTCOME_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        {isGl && (
          <>
            <Input type="date" name="von" defaultValue={f.from} aria-label="Suchanfrage von" title="Suchanfrage von" />
            <Input type="date" name="bis" defaultValue={f.to} aria-label="Suchanfrage bis" title="Suchanfrage bis" />
          </>
        )}
        <button className={btn.secondary}>Filtern</button>
      </form>
      <Table>
        <thead>
          <tr>
            <SortTh base={base} sp={sp} col="name" label="Kunde" />
            <Th>Geburtsdatum</Th>
            <Th>Telefon</Th>
            <Th>E-Mail</Th>
            <Th>Berater</Th>
            <Th>Brokerfirma</Th>
            <SortTh base={base} sp={sp} col="eingang" label="Suchanfrage" defaultSort="eingang" />
            <SortTh base={base} sp={sp} col="uebermittelt" label="An Zentralstelle" />
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <EmptyRow cols={9} />}
          {rows.map((a) => (
            <tr key={a.id} className="hover:bg-surface">
              <Td><Link href={`/antraege/${a.id}`} className="font-medium text-brand-700 hover:underline">{a.lastName} {a.firstName}</Link></Td>
              <Td className="whitespace-nowrap">{formatDate(a.birthDate)}</Td>
              <Td className="whitespace-nowrap">{formatPhone(a.phone)}</Td>
              <Td className="max-w-[200px] truncate">{a.email}</Td>
              <Td>{a.advisorName}</Td>
              <Td>{a.brokerName ?? <span className="text-muted">Pensora</span>}</Td>
              <Td className="whitespace-nowrap">{formatDateTime(a.submittedToPensoraAt)}</Td>
              <Td className="whitespace-nowrap">{formatDate(a.transmittedAt)}</Td>
              <Td><ApplicationStatus review={a.reviewStatus} outcome={a.outcomeStatus} phase={a.phase} /></Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination base={base} sp={sp} page={page} pageSize={pageSize} total={total} />
    </>
  );
}
