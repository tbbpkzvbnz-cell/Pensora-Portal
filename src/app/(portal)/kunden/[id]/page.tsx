import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireActor } from "@/server/auth/session";
import { can, NotFoundError } from "@/server/authz";
import { getCustomer } from "@/server/services/customers";
import { listCustomerDocuments } from "@/server/services/documents";
import { findOpenApplication, listCustomerApplications } from "@/server/services/applications";
import { customerHistory, listNotes } from "@/server/services/notes";
import { getPortfolioSummary } from "@/server/services/portfolio";
import { listAdvisorOptions } from "@/server/services/users";
import { Alert, Badge, ButtonLink, Card, DefinitionList, EmptyRow, PageHeader, Select, Table, Tabs, Td, Th } from "@/components/ui";
import { ConfirmAction } from "@/components/forms";
import { ApplicationStatus, DocsIndicator, IntakeBadge } from "@/components/status-badges";
import { NotesPanel } from "@/components/notes-panel";
import { HistoryList } from "@/components/history-list";
import { DocumentUpload } from "./document-upload";
import { formatAhv } from "@/lib/ahv";
import { ageFrom, formatChf, formatDate, formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { DOCUMENT_TYPE_LABELS } from "@/lib/labels";
import { reassignAction } from "../actions";
import { startApplicationAction } from "../../antraege/actions";

export const metadata: Metadata = { title: "Kundenakte" };

export default async function CustomerPage({ params, searchParams }: PageProps<"/kunden/[id]">) {
  const actor = await requireActor("customers.view");
  const { id } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "uebersicht";
  const data = await getCustomer(actor, id).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; });
  const c = data.customer;
  const [apps, docs, openApp, portfolio] = await Promise.all([
    listCustomerApplications(actor, id),
    listCustomerDocuments(actor, id),
    findOpenApplication(id),
    can(actor, "portfolio.view") ? getPortfolioSummary(actor, id) : Promise.resolve(null),
  ]);
  const canEdit = can(actor, "customers.edit") && (c.intakeStatus !== "antrag_eingereicht" || can(actor, "customers.edit_after_submission"));
  const tabs = [
    { key: "uebersicht", href: `/kunden/${id}`, label: "Übersicht" },
    { key: "dokumente", href: `/kunden/${id}?tab=dokumente`, label: `Dokumente (${docs.filter((d) => !d.supersededAt).length})` },
    { key: "historie", href: `/kunden/${id}?tab=historie`, label: "Historie & Notizen" },
  ];
  return (
    <>
      <PageHeader
        title={`${c.firstName} ${c.lastName}`}
        subtitle={<span className="flex flex-wrap items-center gap-2"><IntakeBadge s={c.intakeStatus} /> <span>Erfasst am {formatDateTime(c.createdAt)}</span></span>}
        breadcrumb={[{ href: "/kunden", label: "Kunden" }]}
        actions={
          <>
            {canEdit && <ButtonLink variant="secondary" href={`/kunden/${id}/bearbeiten`}>Stammdaten bearbeiten</ButtonLink>}
            {can(actor, "applications.create") &&
              (openApp ? (
                <ButtonLink href={`/antraege/${openApp}`}>Offenen Antrag öffnen</ButtonLink>
              ) : (
                <ConfirmAction
                  action={startApplicationAction}
                  fields={{ customerId: id }}
                  label="Freizügigkeitsanfrage auslösen"
                  variant="primary"
                  title="Freizügigkeitsanfrage starten?"
                  message="Die Stammdaten werden automatisch in das Pensora-Vollmachtformular übernommen. Anschliessend können Sie den Erfassungslink für ID und Unterschrift an den Kunden senden."
                  confirmLabel="Antrag starten"
                />
              ))}
          </>
        }
      />
      {sp.neu && <div className="mb-4"><Alert tone="success">Kunde wurde erfasst. Sie können jetzt direkt eine Freizügigkeitsanfrage auslösen – auch wenn noch Unterlagen fehlen, bleibt der Kunde gespeichert.</Alert></div>}
      <Tabs tabs={tabs} active={tab} />

      {tab === "uebersicht" && (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Card title="Stammdaten">
              <DefinitionList
                items={[
                  ["Vorname", c.firstName],
                  ["Nachname", c.lastName],
                  ["Geburtsdatum", `${formatDate(c.birthDate)} (${ageFrom(c.birthDate)} Jahre)`],
                  ["AHV-Nummer", formatAhv(c.ahvNumber)],
                  ["Strasse / Nr.", c.street],
                  ["PLZ / Wohnort", `${c.postalCode} ${c.city}`],
                  ["Telefon", <a key="t" href={`tel:${c.phone}`} className="text-brand-700 hover:underline">{formatPhone(c.phone)}</a>],
                  ["E-Mail", <a key="e" href={`mailto:${c.email}`} className="text-brand-700 hover:underline">{c.email}</a>],
                ]}
              />
            </Card>
            <Card title="Anträge" actions={<span className="text-sm text-muted">{apps.length}</span>}>
              <div className="-m-5">
                <Table>
                  <thead><tr><Th>Erstellt</Th><Th>An Pensora übergeben</Th><Th>An Zentralstelle</Th><Th>Status</Th><Th>Unterlagen</Th></tr></thead>
                  <tbody>
                    {apps.length === 0 && <EmptyRow cols={5} text="Noch keine Freizügigkeitsanfrage." />}
                    {apps.map((a) => (
                      <tr key={a.id} className="hover:bg-surface">
                        <Td><Link className="font-medium text-brand-700 hover:underline" href={`/antraege/${a.id}`}>{formatDateTime(a.createdAt)}</Link></Td>
                        <Td>{formatDateTime(a.submittedToPensoraAt)}</Td>
                        <Td>{formatDateTime(a.transmittedAt)}</Td>
                        <Td><ApplicationStatus review={a.reviewStatus} outcome={a.outcomeStatus} phase={a.phase} /></Td>
                        <Td>{a.docsComplete ? <Badge tone="green">Vollständig</Badge> : <Badge tone="amber">Offen</Badge>}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card>
          </div>
          <div className="space-y-6">
            <Card title="Zuordnung">
              <DefinitionList items={[["Berater", data.advisorName], ["Brokerfirma", data.brokerName ?? "Pensora (intern)"]]} />
              {can(actor, "customers.reassign") && (
                <div className="mt-4">
                  <ConfirmAction action={reassignAction} fields={{ id }} label="Berater ändern" title="Kunde neu zuweisen" message="Die Brokerfirma wird automatisch vom neuen Berater übernommen. Die Änderung wird protokolliert." confirmLabel="Zuweisen">
                    <Select name="advisorId" required defaultValue="">
                      <option value="" disabled>Berater wählen…</option>
                      {(await listAdvisorOptions(actor)).filter((a) => a.status === "active").map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </Select>
                  </ConfirmAction>
                </div>
              )}
            </Card>
            <Card title="Unterlagen">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">ID vorne, ID hinten, Unterschrift</span>
                <DocsIndicator front={data.hasIdFront} back={data.hasIdBack} sig={data.hasSignature} />
              </div>
            </Card>
            {portfolio && (
              <Card title="Portfolio">
                {portfolio.inPortfolio ? (
                  <>
                    <DefinitionList items={[["Eingegangene Gelder", formatChf(portfolio.total)], ["Stiftungen", portfolio.foundationCount], ["Letzter Eingang", formatDate(portfolio.lastReceivedOn)]]} />
                    <Link href={`/portfolio/${id}`} className="mt-4 inline-block text-sm text-brand-700 hover:underline">Portfolio öffnen ›</Link>
                  </>
                ) : (
                  <p className="text-sm text-muted">Nicht im Portfolio.{can(actor, "portfolio.edit") && <> <Link href={`/portfolio/${id}`} className="text-brand-700 hover:underline">Aufnehmen ›</Link></>}</p>
                )}
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === "dokumente" && (
        <div className="space-y-6">
          {(can(actor, "customers.edit") || can(actor, "applications.create")) && (
            <Card title="Dokument hochladen"><DocumentUpload customerId={id} /></Card>
          )}
          <Table>
            <thead><tr><Th>Dokument</Th><Th>Datei</Th><Th>Hochgeladen</Th><Th>Von</Th><Th>Status</Th><Th></Th></tr></thead>
            <tbody>
              {docs.length === 0 && <EmptyRow cols={6} text="Noch keine Dokumente vorhanden." />}
              {docs.map((d) => (
                <tr key={d.id} className={d.supersededAt ? "text-muted" : "hover:bg-surface"}>
                  <Td className="font-medium">{DOCUMENT_TYPE_LABELS[d.type]}</Td>
                  <Td className="max-w-[260px] truncate">{d.fileName}</Td>
                  <Td>{formatDateTime(d.createdAt)}{d.receivedOn && <div className="text-xs text-muted">Eingang {formatDate(d.receivedOn)}</div>}</Td>
                  <Td>{d.viaLink ? "Kunde (Link)" : d.uploadedByFirst ? `${d.uploadedByFirst} ${d.uploadedByName}` : "System"}</Td>
                  <Td>{d.supersededAt ? <Badge>Ersetzt</Badge> : <Badge tone="green">Aktuell</Badge>}</Td>
                  <Td className="whitespace-nowrap text-right">
                    <a className="text-brand-700 hover:underline" href={`/api/dokumente/${d.id}`} target="_blank" rel="noopener">Öffnen</a>
                    <span className="mx-2 text-line">|</span>
                    <a className="text-brand-700 hover:underline" href={`/api/dokumente/${d.id}?download=1`}>Download</a>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {tab === "historie" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card title="Interne Notizen">
            <NotesPanel customerId={id} notes={await listNotes(actor, id)} canCreate={can(actor, "notes.create")} canInternal={actor.role.startsWith("pensora_")} actorId={actor.id} />
          </Card>
          <Card title="Kundenhistorie"><HistoryList entries={await customerHistory(actor, id)} /></Card>
        </div>
      )}
    </>
  );
}
