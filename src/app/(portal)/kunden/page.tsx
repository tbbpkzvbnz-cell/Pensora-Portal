import Link from "next/link";
import type { Metadata } from "next";
import { requireActor } from "@/server/auth/session";
import { can } from "@/server/authz";
import { listCustomers } from "@/server/services/customers";
import { listBrokers } from "@/server/services/brokers";
import { listAdvisorOptions } from "@/server/services/users";
import { ButtonLink, EmptyRow, Input, PageHeader, Select, Table, Td, Th, btn } from "@/components/ui";
import { Pagination, SortTh, sp1, withParams } from "@/components/table-nav";
import { ApplicationStatus, DocsIndicator, IntakeBadge } from "@/components/status-badges";
import { INTAKE_STATUS_LABELS } from "@/lib/labels";
import { ageFrom, formatDate, formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";

export const metadata: Metadata = { title: "Kunden" };

export default async function CustomersPage({ searchParams }: PageProps<"/kunden">) {
  const actor = await requireActor("customers.view");
  const sp = await searchParams;
  const isGl = actor.role === "pensora_gl" || actor.role === "pensora_backoffice";
  const f = {
    q: sp1(sp, "q"),
    brokerFirmId: isGl ? sp1(sp, "broker") : undefined,
    advisorId: actor.role === "broker_advisor" || actor.role === "pensora_advisor" ? undefined : sp1(sp, "advisor"),
    status: sp1(sp, "status"),
    sort: sp1(sp, "sort") || "erfasst",
    dir: sp1(sp, "dir") || "desc",
    page: Number(sp1(sp, "page")) || 1,
  };
  const [{ rows, total, page, pageSize }, brokers, advisors] = await Promise.all([
    listCustomers(actor, f),
    isGl ? listBrokers(actor) : Promise.resolve([]),
    actor.role === "pensora_gl" || actor.role === "broker_gl" || actor.role === "pensora_backoffice" ? listAdvisorOptions(actor) : Promise.resolve([]),
  ]);
  const base = "/kunden";
  return (
    <>
      <PageHeader
        title="Kunden"
        subtitle={`${total.toLocaleString("de-CH")} Kunden in Ihrem Bereich`}
        actions={
          <>
            {can(actor, "export.data") && <a className={btn.secondary} href={withParams("/api/export/kunden", sp, { page: undefined })}>Export CSV</a>}
            {can(actor, "customers.create") && <ButtonLink href="/kunden/neu">Neuer Kunde</ButtonLink>}
          </>
        }
      />
      <form className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input name="q" placeholder="Name, E-Mail, Telefon…" defaultValue={f.q} className="lg:col-span-2" />
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
        <div className="flex gap-2">
          <Select name="status" defaultValue={f.status}>
            <option value="">Alle Status</option>
            {Object.entries(INTAKE_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <button className={btn.secondary}>Filtern</button>
        </div>
      </form>
      <Table>
        <thead>
          <tr>
            <SortTh base={base} sp={sp} col="name" label="Name" defaultSort="erfasst" />
            <SortTh base={base} sp={sp} col="geburtsdatum" label="Geburtsdatum" defaultSort="erfasst" />
            <Th>Telefon</Th>
            <Th>E-Mail</Th>
            <Th>Berater</Th>
            <Th>Brokerfirma</Th>
            <SortTh base={base} sp={sp} col="erfasst" label="Erfasst" defaultSort="erfasst" />
            <SortTh base={base} sp={sp} col="status" label="Kundenstatus" defaultSort="erfasst" />
            <Th>Antragsstatus</Th>
            <Th>Dokumente</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <EmptyRow cols={10} text={f.q ? "Keine Kunden zu Ihrer Suche gefunden." : "Noch keine Kunden erfasst."} />}
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-surface">
              <Td><Link href={`/kunden/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.lastName} {c.firstName}</Link></Td>
              <Td className="whitespace-nowrap">{formatDate(c.birthDate)} <span className="text-muted">({ageFrom(c.birthDate)})</span></Td>
              <Td className="whitespace-nowrap">{formatPhone(c.phone)}</Td>
              <Td className="max-w-[220px] truncate">{c.email}</Td>
              <Td>{c.advisorName}</Td>
              <Td>{c.brokerName ?? <span className="text-muted">Pensora</span>}</Td>
              <Td className="whitespace-nowrap">{formatDateTime(c.createdAt)}</Td>
              <Td><IntakeBadge s={c.intakeStatus} /></Td>
              <Td><ApplicationStatus review={c.reviewStatus} outcome={c.outcomeStatus} /></Td>
              <Td><DocsIndicator front={c.hasIdFront} back={c.hasIdBack} sig={c.hasSignature} /></Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination base={base} sp={sp} page={page} pageSize={pageSize} total={total} />
    </>
  );
}
