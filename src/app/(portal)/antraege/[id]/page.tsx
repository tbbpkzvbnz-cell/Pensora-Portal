import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireActor } from "@/server/auth/session";
import { can, NotFoundError } from "@/server/authz";
import { applicationDocuments, applicationHistory, getApplication, listCaptureLinks } from "@/server/services/applications";
import { listResponses } from "@/server/services/review";
import { smsState } from "@/server/integrations/sms";
import { Alert, Badge, ButtonLink, Card, DefinitionList, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/forms";
import { ApplicationStatus, OutcomeBadge } from "@/components/status-badges";
import { StatusTimeline } from "@/components/status-timeline";
import { CaptureLinkPanel } from "./capture-panel";
import { ResponseUpload } from "./response-upload";
import { formatAhv } from "@/lib/ahv";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { DOCUMENT_TYPE_LABELS, OUTCOME_STATUS_LABELS } from "@/lib/labels";
import { revokeLinkAction, setOutcomeAction, submitManuallyAction } from "../actions";

export const metadata: Metadata = { title: "Antrag" };

export default async function ApplicationPage({ params }: PageProps<"/antraege/[id]">) {
  const actor = await requireActor("applications.view");
  const { id } = await params;
  const app = await getApplication(actor, id).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; });
  const [docs, history, links, responses] = await Promise.all([applicationDocuments(actor, id), applicationHistory(actor, id), listCaptureLinks(actor, id), listResponses(actor, id)]);
  const f = app.formData;
  const draft = app.phase === "entwurf";
  const reopen = app.reviewStatus === "unterlagen_unvollstaendig" || app.reviewStatus === "rueckfrage_erforderlich";
  const canCapture = can(actor, "applications.create") && (draft || reopen);
  const activeLinks = links.filter((l) => l.status === "active" && l.expiresAt > new Date());
  const lastNote = history.find((h) => h.h.kind === "review" && h.h.note && (h.h.newStatus === "unterlagen_unvollstaendig" || h.h.newStatus === "rueckfrage_erforderlich"));
  const current = docs.filter((d) => !d.supersededAt);
  return (
    <>
      <PageHeader
        title={<>Freizügigkeitsanfrage · <Link href={`/kunden/${app.customerId}`} className="hover:text-brand-700">{f.firstName} {f.lastName}</Link></>}
        subtitle={<span className="flex flex-wrap items-center gap-2"><ApplicationStatus review={app.reviewStatus} outcome={app.outcomeStatus} phase={app.phase} /> Antragsdatum {formatDate(app.applicationDate)}</span>}
        breadcrumb={[{ href: "/antraege", label: "Anträge" }]}
        actions={
          <>
            {can(actor, "review.access") && app.phase === "eingereicht" && <ButtonLink variant="secondary" href={`/pruefung/${id}`}>In Prüfung öffnen</ButtonLink>}
            {app.pdfDocumentId && <a className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700" href={`/api/dokumente/${app.pdfDocumentId}?download=1`}>Vollständiges PDF herunterladen</a>}
          </>
        }
      />
      {reopen && lastNote && (
        <div className="mb-4"><Alert tone="warning"><strong>Rückmeldung von Pensora:</strong> {lastNote.h.note}</Alert></div>
      )}
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          <Card title={draft ? "Vorschau Vollmachtformular" : "Vollmacht"} actions={<a className="text-sm text-brand-700 hover:underline" href={app.pdfDocumentId ? `/api/dokumente/${app.pdfDocumentId}` : `/api/antraege/${id}/vorschau`} target="_blank" rel="noopener">In neuem Tab öffnen</a>}>
            {draft && <p className="mb-3 text-sm text-muted">Die Daten werden aus den Stammdaten übernommen; Antragsdatum und Wohnort werden automatisch eingetragen. Unterschrift und ID-Kopie werden nach der Erfassung durch den Kunden ergänzt.</p>}
            <iframe title="Vollmacht" src={app.pdfDocumentId ? `/api/dokumente/${app.pdfDocumentId}` : `/api/antraege/${id}/vorschau`} className="h-[720px] w-full rounded-lg border border-line" />
          </Card>
        </div>
        <div className="space-y-6 xl:col-span-2">
          {canCapture && (
            <Card title={reopen ? "Unterlagen nachreichen" : "ID und Unterschrift erfassen"}>
              <CaptureLinkPanel applicationId={id} smsActive={smsState().active} phone={formatPhone(app.phone)} />
              {activeLinks.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
                  {activeLinks.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span>Aktiver Link · gültig bis {formatDateTime(l.expiresAt)}{l.smsSentAt ? " · per SMS gesendet" : ""}{l.smsError ? " · SMS fehlgeschlagen" : ""}</span>
                      <ConfirmAction action={revokeLinkAction} fields={{ linkId: l.id, applicationId: id }} label="Widerrufen" title="Link widerrufen?" message="Der Kunde kann den Link danach nicht mehr verwenden." confirmLabel="Widerrufen" danger />
                    </li>
                  ))}
                </ul>
              )}
              {app.docsComplete || current.filter((d) => ["id_front", "id_back", "signature"].includes(d.type)).length === 3 ? (
                <div className="mt-4 border-t border-line pt-4">
                  <ConfirmAction action={submitManuallyAction} fields={{ applicationId: id }} label="An Pensora übergeben" variant="primary" title="Antrag an Pensora übergeben?" message="Das vollständige PDF wird erstellt und der Antrag erscheint in „Überprüfungen & Übermittlungen“." confirmLabel="Übergeben" />
                </div>
              ) : null}
            </Card>
          )}
          <Card title="Antragsdaten">
            <DefinitionList
              items={[
                ["Name", `${f.lastName} ${f.firstName}`],
                ["Geburtsdatum", formatDate(f.birthDate)],
                ["AHV-Nr.", formatAhv(f.ahvNumber)],
                ["Adresse", `${f.street}, ${f.postalCode} ${f.city}`],
                ["Telefon", formatPhone(f.phone)],
                ["E-Mail", f.email],
                ["Berater", app.advisorName],
                ["Brokerfirma", app.brokerName ?? "Pensora (intern)"],
                ["Antrag erstellt", formatDateTime(app.createdAt)],
                ["Übergabe an Pensora (Suchanfrage)", formatDateTime(app.submittedToPensoraAt)],
                ["Übermittlung an Zentralstelle", formatDateTime(app.transmittedAt)],
                ["Antragsstatus", <OutcomeBadge key="o" s={app.outcomeStatus} />],
              ]}
            />
          </Card>
          {can(actor, "applications.change_outcome") && app.reviewStatus === "uebermittelt" && (
            <Card title="Antragsstatus ändern">
              <ActionForm action={setOutcomeAction} className="space-y-3">
                {() => (
                  <>
                    <input type="hidden" name="applicationId" value={id} />
                    <Field label="Neuer Status">
                      <Select name="status" defaultValue={app.outcomeStatus ?? "warten_auf_antwort"}>
                        {Object.entries(OUTCOME_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </Select>
                    </Field>
                    <Field label="Bemerkung (optional)"><Textarea name="note" rows={2} /></Field>
                    <div className="flex justify-end"><SubmitButton>Status speichern</SubmitButton></div>
                  </>
                )}
              </ActionForm>
            </Card>
          )}
          {can(actor, "responses.upload") && app.reviewStatus === "uebermittelt" && (
            <Card title="Antwortdokument der Zentralstelle hochladen">
              <ResponseUpload applicationId={id} customerLabel={`${f.lastName} ${f.firstName}, geb. ${formatDate(f.birthDate)}`} />
            </Card>
          )}
          <Card title="Dokumente">
            <ul className="divide-y divide-line text-sm">
              {docs.length === 0 && <li className="py-2 text-muted">Noch keine Dokumente.</li>}
              {docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                  <span className={d.supersededAt ? "text-muted line-through" : ""}>{DOCUMENT_TYPE_LABELS[d.type]}{d.receivedOn ? ` · Eingang ${formatDate(d.receivedOn)}` : ""}</span>
                  <span className="flex items-center gap-3">
                    {d.supersededAt && <Badge>Ersetzt</Badge>}
                    <a href={`/api/dokumente/${d.id}`} target="_blank" rel="noopener" className="text-brand-700 hover:underline">Öffnen</a>
                  </span>
                </li>
              ))}
            </ul>
            {responses.length > 0 && <p className="mt-3 text-xs text-muted">{responses.length} Antwortdokument(e) der Zentralstelle erfasst.</p>}
          </Card>
          <Card title="Statusverlauf"><StatusTimeline entries={history} /></Card>
        </div>
      </div>
    </>
  );
}
