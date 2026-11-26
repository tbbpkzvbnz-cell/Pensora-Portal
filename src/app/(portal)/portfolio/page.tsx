import Link from "next/link";
import type { Metadata } from "next";
import { requireActor } from "@/server/auth/session";
import { can } from "@/server/authz";
import { listPortfolio, listPortfolioCandidates } from "@/server/services/portfolio";
import { listBrokers } from "@/server/services/brokers";
import { listAdvisorOptions } from "@/server/services/users";
import { Card, EmptyRow, Input, PageHeader, Select, Stat, Table, Td, Th, btn } from "@/components/ui";
import { ConfirmAction } from "@/components/forms";
import { Pagination, SortTh, sp1, withParams } from "@/components/table-nav";
import { formatChf, formatDate } from "@/lib/format";
import { addToPortfolioAction } from "./actions";

export const metadata: Metadata = { title: "Portfolio" };

export default async function PortfolioPage({ searchParams }: PageProps<"/portfolio">) {
  const actor = await requireActor("portfolio.view");
  const sp = await searchParams;
  const isGl = actor.role === "pensora_gl" || actor.role === "pensora_backoffice";
  const f = {
    q: sp1(sp, "q"),
    brokerFirmId: isGl ? sp1(sp, "broker") : undefined,
    advisorId: actor.role.endsWith("advisor") ? undefined : sp1(sp, "advisor"),
    sort: sp1(sp, "sort") || "betrag",
    dir: sp1(sp, "dir") || "desc",
    page: Number(sp1(sp, "page")) || 1,
  };
  const [{ rows, total, page, pageSize, sum }, brokers, advisors, candidates] = await Promise.all([
    listPortfolio(actor, f),
    isGl ? listBrokers(actor) : Promise.resolve([]),
    actor.role === "pensora_gl" || actor.role === "broker_gl" ? listAdvisorOptions(actor) : Promise.resolve([]),
    can(actor, "portfolio.edit") ? listPortfolioCandidates(actor) : Promise.resolve([]),
  ]);
  const base = "/portfolio";
  return (
    <>
      <PageHeader
        title="Portfolio"
        subtitle={can(actor, "portfolio.edit") ? "Eingegangene Vorsorgegelder" : "Eingegangene Vorsorgegelder Ihrer Kunden (nur Lesezugriff)"}
        actions={can(actor, "export.data") && <a className={btn.secondary} href={withParams("/api/export/portfolio", sp, { page: undefined })}>Export CSV</a>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Kunden im Portfolio" value={total.toLocaleString("de-CH")} />
        <Stat label="Eingegangene Gelder (Filter)" value={formatChf(sum)} />
        {candidates.length > 0 && <Stat label="Konto eröffnet, noch nicht aufgenommen" value={candidates.length} />}
      </div>
      {candidates.length > 0 && (
        <Card title="Zur Aufnahme bereit (Konto eröffnet)" className="mb-6">
          <ul className="divide-y divide-line text-sm">
            {candidates.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><Link href={`/kunden/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.lastName} {c.firstName}</Link> <span className="text-muted">· {c.advisorName}</span></span>
                <ConfirmAction action={addToPortfolioAction} fields={{ customerId: c.id }} label="Ins Portfolio aufnehmen" title="Kunde ins Portfolio aufnehmen?" message="Bitte nur nach bestätigtem Geldeingang. Die bestehenden Kundendaten werden übernommen." confirmLabel="Aufnehmen" />
              </li>
            ))}
          </ul>
        </Card>
      )}
      <form className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input name="q" placeholder="Kundenname" defaultValue={f.q} />
        {isGl && (
          <Select name="broker" defaultValue={f.brokerFirmId}>
            <option value="">Alle Broker</option>
            <option value="pensora">Pensora (intern)</option>
            {brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
        {advisors.length > 0 && (
          <Select name="advisor" defaultValue={f.advisorId}>
            <option value="">Alle Berater</option>
            {advisors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        )}
        <button className={btn.secondary}>Filtern</button>
      </form>
      <Table>
        <thead>
          <tr>
            <SortTh base={base} sp={sp} col="name" label="Kunde" defaultSort="betrag" />
            <Th>Broker</Th>
            <Th>Berater</Th>
            <Th>Stiftung(en)</Th>
            <SortTh base={base} sp={sp} col="betrag" label="Eingegangen" defaultSort="betrag" className="text-right" />
            <Th>Nach Stiftungen</Th>
            <SortTh base={base} sp={sp} col="eingang" label="Letzter Eingang" defaultSort="betrag" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <EmptyRow cols={7} text="Noch keine Kunden im Portfolio." />}
          {rows.map((r) => (
            <tr key={r.customerId} className="align-top hover:bg-surface">
              <Td><Link href={`/portfolio/${r.customerId}`} className="font-medium text-brand-700 hover:underline">{r.lastName} {r.firstName}</Link></Td>
              <Td>{r.brokerName ?? <span className="text-muted">Pensora</span>}</Td>
              <Td>{r.advisorName}</Td>
              <Td>{r.foundations?.map((x) => x.name).join(", ") || "–"}</Td>
              <Td className="text-right font-medium tabular-nums">{formatChf(r.total)}</Td>
              <Td className="text-xs">
                {r.foundations?.length ? r.foundations.map((x) => <div key={x.name} className="whitespace-nowrap">{x.name}: <span className="tabular-nums">{formatChf(x.amount)}</span></div>) : "–"}
              </Td>
              <Td className="whitespace-nowrap">{formatDate(r.lastReceivedOn)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination base={base} sp={sp} page={page} pageSize={pageSize} total={total} />
    </>
  );
}
