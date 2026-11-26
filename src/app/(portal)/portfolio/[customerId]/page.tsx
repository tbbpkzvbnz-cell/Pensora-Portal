import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireActor } from "@/server/auth/session";
import { can, NotFoundError } from "@/server/authz";
import { getPortfolio, listFoundations } from "@/server/services/portfolio";
import { customerHistory, listNotes } from "@/server/services/notes";
import { Alert, Badge, Card, DefinitionList, EmptyRow, Input, PageHeader, Table, Tabs, Td, Th } from "@/components/ui";
import { ConfirmAction } from "@/components/forms";
import { NotesPanel } from "@/components/notes-panel";
import { HistoryList } from "@/components/history-list";
import { FoundationToggle, OrderToggle, TransactionToggle } from "./portfolio-forms";
import { formatChf, formatDate, formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { TRANSFER_ORDER_STATUS_LABELS } from "@/lib/labels";
import { addToPortfolioAction, deleteTransactionAction, removeFoundationAction, removeFromPortfolioAction } from "../actions";

export const metadata: Metadata = { title: "Portfolio" };

export default async function PortfolioDetailPage({ params, searchParams }: PageProps<"/portfolio/[customerId]">) {
  const actor = await requireActor("portfolio.view");
  const { customerId } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "uebersicht";
  const data = await getPortfolio(actor, customerId).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; });
  const c = data.cust.customer;
  const edit = can(actor, "portfolio.edit");
  const header = (
    <PageHeader
      title={`${c.firstName} ${c.lastName}`}
      subtitle="Portfolio"
      breadcrumb={[{ href: "/portfolio", label: "Portfolio" }]}
      actions={<Link href={`/kunden/${customerId}`} className="inline-flex items-center rounded-lg border border-line px-4 py-2 text-sm hover:bg-brand-50">Kundenakte</Link>}
    />
  );
  if (!data.portfolio) {
    return (
      <>
        {header}
        <Card>
          <p className="text-sm text-muted">Dieser Kunde ist nicht im Portfolio.{data.accountOpened ? " Das Konto wurde eröffnet." : " Für diesen Kunden ist noch kein Antrag mit „Konto eröffnet“ erfasst."}</p>
          {edit && (
            <div className="mt-4">
              <ConfirmAction action={addToPortfolioAction} fields={{ customerId }} label="Ins Portfolio aufnehmen" variant="primary" title="Kunde ins Portfolio aufnehmen?" message="Bitte nur nach bestätigtem Geldeingang. Alle bestehenden Kundendaten, Dokumente und Verknüpfungen bleiben erhalten." confirmLabel="Aufnehmen" />
            </div>
          )}
        </Card>
      </>
    );
  }
  const foundationOpts = data.foundations.map((f) => ({ id: f.pf.foundationId, name: f.name }));
  const allFoundations = (await listFoundations()).map((f) => ({ id: f.id, name: f.name }));
  const orderOpts = data.orders.map((o) => ({ id: o.o.id, name: `${o.name} · ${formatDate(o.o.orderDate)}${o.o.orderAmount ? ` · ${formatChf(o.o.orderAmount)}` : ""}` }));
  const tabs = [
    { key: "uebersicht", href: `/portfolio/${customerId}`, label: "Übersicht" },
    { key: "stiftungen", href: `/portfolio/${customerId}?tab=stiftungen`, label: "Stiftungen & Überweisungsaufträge" },
    { key: "transaktionen", href: `/portfolio/${customerId}?tab=transaktionen`, label: "Transaktionen" },
    { key: "notizen", href: `/portfolio/${customerId}?tab=notizen`, label: "Historie & Notizen" },
  ];
  return (
    <>
      {header}
      <Tabs tabs={tabs} active={tab} />

      {tab === "uebersicht" && (
        <div className="grid gap-6 xl:grid-cols-3">
          <Card title="Kundeninformationen" className="xl:col-span-2">
            <DefinitionList
              items={[
                ["Name", c.lastName],
                ["Vorname", c.firstName],
                ["Geburtsdatum", formatDate(c.birthDate)],
                ["Telefon", formatPhone(c.phone)],
                ["E-Mail", c.email],
                ["Broker", data.cust.brokerName ?? "Pensora (intern)"],
                ["Berater", data.cust.advisorName],
                ["Im Portfolio seit", formatDateTime(data.portfolio.addedAt)],
              ]}
            />
          </Card>
          <Card title="Eingegangene Gelder">
            <div className="text-3xl font-semibold tabular-nums text-brand-700">{formatChf(data.total)}</div>
            <div className="mt-1 text-xs text-muted">Letzter Eingang {formatDate(data.lastReceivedOn)} · automatisch aus Transaktionen berechnet</div>
            <ul className="mt-4 divide-y divide-line text-sm">
              {data.byFoundation.length === 0 && <li className="py-2 text-muted">Noch keine Stiftung hinterlegt.</li>}
              {data.byFoundation.map((f) => (
                <li key={f.foundationId} className="flex justify-between py-2"><span>{f.name}</span><span className="tabular-nums">{formatChf(f.total)}</span></li>
              ))}
              {data.byFoundation.length > 0 && <li className="flex justify-between py-2 font-semibold"><span>Gesamteingang</span><span className="tabular-nums">{formatChf(data.total)}</span></li>}
            </ul>
            {edit && (
              <div className="mt-4 border-t border-line pt-4">
                <ConfirmAction action={removeFromPortfolioAction} fields={{ customerId }} label="Aus Portfolio entfernen" title="Aus dem Portfolio entfernen?" message="Nur möglich, wenn keine Transaktionen oder Überweisungsaufträge erfasst sind (Aufbewahrungspflicht)." confirmLabel="Entfernen" danger />
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "stiftungen" && (
        <div className="space-y-6">
          <Card title="Stiftungen" actions={edit && <FoundationToggle label="Stiftung hinzufügen" customerId={customerId} all={allFoundations} />}>
            <div className="-m-5">
              <Table>
                <thead><tr><Th>Stiftung</Th><Th>Konto eröffnet</Th><Th>Bemerkung</Th><Th className="text-right">Eingegangen</Th>{edit && <Th></Th>}</tr></thead>
                <tbody>
                  {data.foundations.length === 0 && <EmptyRow cols={5} text="Noch keine Stiftung hinterlegt." />}
                  {data.foundations.map((f) => (
                    <tr key={f.pf.id} className="align-top">
                      <Td className="font-medium">{f.name}{f.address && <div className="text-xs font-normal text-muted">{f.address}</div>}</Td>
                      <Td>{formatDate(f.pf.accountOpenedOn)}</Td>
                      <Td className="max-w-xs whitespace-pre-wrap">{f.pf.remark ?? "–"}</Td>
                      <Td className="text-right tabular-nums">{formatChf(data.byFoundation.find((b) => b.foundationId === f.pf.foundationId)?.total ?? 0)}</Td>
                      {edit && (
                        <Td className="w-72">
                          <div className="flex flex-wrap justify-end gap-2">
                            <FoundationToggle label="Bearbeiten" customerId={customerId} all={allFoundations} edit={{ pfId: f.pf.id, foundationId: f.pf.foundationId, accountOpenedOn: f.pf.accountOpenedOn, remark: f.pf.remark }} />
                            <ConfirmAction action={removeFoundationAction} fields={{ customerId, pfId: f.pf.id }} label="Entfernen" title="Stiftung entfernen?" message="Nur möglich, solange keine Transaktionen oder Aufträge zu dieser Stiftung bestehen." confirmLabel="Entfernen" danger />
                          </div>
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>
          <Card title="Überweisungsaufträge" actions={edit && foundationOpts.length > 0 && <OrderToggle label="Neuer Überweisungsauftrag" variant="primary" customerId={customerId} foundations={foundationOpts} />}>
            <div className="-m-5">
              <Table>
                <thead><tr><Th>Stiftung</Th><Th>Auftragsdatum</Th><Th>Status</Th><Th className="text-right">Auftragsbetrag</Th><Th>Eingangsdatum</Th><Th className="text-right">Eingegangen</Th>{edit && <Th></Th>}</tr></thead>
                <tbody>
                  {data.orders.length === 0 && <EmptyRow cols={7} text="Keine Überweisungsaufträge." />}
                  {data.orders.map(({ o, name }) => (
                    <tr key={o.id} className="align-top">
                      <Td className="font-medium">{name}</Td>
                      <Td>{formatDate(o.orderDate)}</Td>
                      <Td><Badge tone={o.status === "ausgefuehrt" ? "green" : o.status === "storniert" ? "gray" : "violet"}>{TRANSFER_ORDER_STATUS_LABELS[o.status]}</Badge></Td>
                      <Td className="text-right tabular-nums">{o.orderAmount ? formatChf(o.orderAmount) : "–"}</Td>
                      <Td>{formatDate(o.receivedOn)}</Td>
                      <Td className="text-right tabular-nums">{o.receivedAmount ? formatChf(o.receivedAmount) : "–"}</Td>
                      {edit && <Td className="w-40 text-right"><OrderToggle label="Bearbeiten" customerId={customerId} foundations={foundationOpts} edit={o} /></Td>}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>
        </div>
      )}

      {tab === "transaktionen" && (
        <Card title="Transaktionen" actions={edit && foundationOpts.length > 0 && <TransactionToggle label="Neue Transaktion" variant="primary" customerId={customerId} foundations={foundationOpts} orders={orderOpts} />}>
          {edit && foundationOpts.length === 0 && <div className="mb-4"><Alert tone="info">Bitte zuerst unter „Stiftungen“ eine Stiftung hinterlegen.</Alert></div>}
          <div className="-m-5">
            <Table>
              <thead><tr><Th>Eingang</Th><Th>Auftrag</Th><Th>Stiftung</Th><Th>Art</Th><Th className="text-right">Betrag</Th><Th>Bemerkung</Th><Th>Erfasst</Th>{edit && <Th></Th>}</tr></thead>
              <tbody>
                {data.transactions.length === 0 && <EmptyRow cols={8} text="Noch keine Transaktionen." />}
                {data.transactions.map(({ t, name, by }) => (
                  <tr key={t.id} className="align-top">
                    <Td className="whitespace-nowrap">{t.receivedOn ? formatDate(t.receivedOn) : <Badge tone="amber">ausstehend</Badge>}</Td>
                    <Td className="whitespace-nowrap">{formatDate(t.orderDate)}</Td>
                    <Td>{name}</Td>
                    <Td>{t.kind === "korrektur" ? <Badge tone="amber">Korrektur</Badge> : "Eingang"}</Td>
                    <Td className="text-right font-medium tabular-nums">{formatChf(t.amount)}</Td>
                    <Td className="max-w-xs whitespace-pre-wrap text-sm">{t.remark ?? "–"}</Td>
                    <Td className="text-xs text-muted">{formatDateTime(t.createdAt)}<br />{by}{t.updatedAt.getTime() - t.createdAt.getTime() > 1000 && <><br />geändert {formatDateTime(t.updatedAt)}</>}</Td>
                    {edit && (
                      <Td className="w-72">
                        <div className="flex flex-wrap justify-end gap-2">
                          <TransactionToggle label="Bearbeiten" customerId={customerId} foundations={foundationOpts} orders={orderOpts} edit={t} />
                          <ConfirmAction action={deleteTransactionAction} fields={{ customerId, txId: t.id }} label="Stornieren" title="Transaktion stornieren?" message="Die Transaktion wird nicht mehr mitgerechnet, bleibt aber im Protokoll nachvollziehbar." confirmLabel="Stornieren" danger>
                            <Input name="reason" placeholder="Begründung (Pflicht)" required />
                          </ConfirmAction>
                        </div>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          <div className="mt-8 flex justify-end text-sm"><span className="mr-3 text-muted">Gesamteingang</span><span className="font-semibold tabular-nums">{formatChf(data.total)}</span></div>
        </Card>
      )}

      {tab === "notizen" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card title="Kundenaktivitäten & Notizen">
            <NotesPanel customerId={customerId} notes={await listNotes(actor, customerId)} canCreate={can(actor, "notes.create")} canInternal={actor.role.startsWith("pensora_")} actorId={actor.id} />
          </Card>
          <Card title="Änderungsprotokoll"><HistoryList entries={await customerHistory(actor, customerId)} /></Card>
        </div>
      )}
    </>
  );
}
