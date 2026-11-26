import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireActor } from "@/server/auth/session";
import { can, NotFoundError } from "@/server/authz";
import { applicationDocuments, applicationHistory, getApplication } from "@/server/services/applications";
import { listResponses, listSubmissions, MANUAL_REVIEW_STATUSES, transmissionDraft } from "@/server/services/review";
import { listNotes } from "@/server/services/notes";
import { Alert, Badge, Card, DefinitionList, PageHeader } from "@/components/ui";
import { ConfirmAction } from "@/components/forms";
import { ReviewStatusForm, TransmitForm } from "./forms";
import { OutcomeBadge, ReviewBadge } from "@/components/status-badges";
import { StatusTimeline } from "@/components/status-timeline";
import { ResponseUpload } from "../../antraege/[id]/response-upload";
import { formatAhv } from "@/lib/ahv";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { regeneratePdfAction } from "../actions";

export const metadata: Metadata = { title: "Prüfung" };

export default async function ReviewDetailPage({ params }: PageProps<"/pruefung/[id]">) {
  const actor = await requireActor("review.access");
  const { id } = await params;
  const app = await getApplication(actor, id).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; });
  if (app.phase !== "eingereicht") notFound();
  const [docs, history, subs, responses, draft, notes] = await Promise.all([
    applicationDocuments(actor, id),
    applicationHistory(actor, id),
    listSubmissions(actor, id),
    listResponses(actor, id),
    can(actor, "review.transmit") ? transmissionDraft(actor, id) : Promise.resolve(null),
    listNotes(actor, app.customerId),
  ]);
  const cur = (t: string) => docs.find((d) => d.type === t && !d.supersededAt);
  const front = cur("id_front"), back = cur("id_back"), sig = cur("signature");
  const transmitted = app.reviewStatus === "uebermittelt";
  const f = app.formData;
  return (
    <>
      <PageHeader
        title={`${f.lastName} ${f.firstName}`}
        subtitle={<span className="flex flex-wrap items-center gap-2"><ReviewBadge s={app.reviewStatus} />{app.outcomeStatus && <OutcomeBadge s={app.outcomeStatus} />} Eingang {formatDateTime(app.submittedToPensoraAt)}</span>}
        breadcrumb={[{ href: transmitted ? "/pruefung/uebermittlungen" : "/pruefung", label: "Überprüfungen & Übermittlungen" }]}
        actions={
          <>
            <Link className="inline-flex items-center rounded-lg border border-line px-4 py-2 text-sm hover:bg-brand-50" href={`/kunden/${app.customerId}`}>Kundenakte</Link>
            {app.pdfDocumentId && <a className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700" href={`/api/dokumente/${app.pdfDocumentId}?download=1`}>Vollständiges PDF herunterladen</a>}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          <Card title="Pensora-Vollmachtsformular" actions={!transmitted && can(actor, "review.change_status") && <ConfirmAction action={regeneratePdfAction} fields={{ applicationId: id }} label="PDF neu erstellen" title="PDF neu erstellen?" message="Das Antrags-PDF wird aus Formular, aktueller Unterschrift und aktuellen ID-Kopien neu erstellt." confirmLabel="Neu erstellen" />}>
            {app.pdfDocumentId ? <iframe title="Vollmacht" src={`/api/dokumente/${app.pdfDocumentId}`} className="h-[760px] w-full rounded-lg border border-line" /> : <Alert tone="warning">Noch kein PDF vorhanden.</Alert>}
          </Card>
          <div className="grid gap-6 md:grid-cols-3">
            {[["ID-Kopie Vorderseite", front], ["ID-Kopie Rückseite", back], ["Digitale Unterschrift", sig]].map(([label, d]) => {
              const doc = d as typeof front;
              return (
                <Card key={label as string} title={label as string}>
                  {doc ? (
                    <a href={`/api/dokumente/${doc.id}`} target="_blank" rel="noopener">
                      {doc.mimeType === "application/pdf" ? <span className="text-sm text-brand-700 underline">PDF öffnen</span> : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/dokumente/${doc.id}`} alt={label as string} className="max-h-56 w-full rounded border border-line bg-white object-contain" />
                      )}
                    </a>
                  ) : <Badge tone="red">Fehlt</Badge>}
                </Card>
              );
            })}
          </div>
        </div>
        <div className="space-y-6 xl:col-span-2">
          <Card title="Antrag">
            <DefinitionList
              items={[
                ["Kunde", `${f.lastName} ${f.firstName}`],
                ["Geburtsdatum", formatDate(f.birthDate)],
                ["AHV-Nr.", formatAhv(f.ahvNumber)],
                ["Adresse", `${f.street}, ${f.postalCode} ${f.city}`],
                ["Telefon", formatPhone(f.phone)],
                ["E-Mail", f.email],
                ["Berater", app.advisorName],
                ["Brokerfirma", app.brokerName ?? "Pensora (intern)"],
                ["Antragsdatum", formatDate(app.applicationDate)],
                ["Suchanfrage (Übergabe an Pensora)", formatDateTime(app.submittedToPensoraAt)],
                ["Übermittlung an Zentralstelle", formatDateTime(app.transmittedAt)],
              ]}
            />
          </Card>
          {!transmitted && can(actor, "review.change_status") && (
            <Card title="Bearbeitungsstatus">
              <ReviewStatusForm applicationId={id} current={app.reviewStatus === "neu_eingegangen" ? "in_pruefung" : app.reviewStatus ?? "in_pruefung"} statuses={MANUAL_REVIEW_STATUSES} />
            </Card>
          )}
          {!transmitted && draft && (
            <Card title="Übermittlung an die Zentralstelle 2. Säule">
              {!draft.emailActive && <div className="mb-3"><Alert tone="warning">E-Mail-Integration nicht aktiv. Der Versand ist erst nach Hinterlegung des SMTP-Zugangs des Pensora-Geschäftspostfachs möglich. Das PDF kann heruntergeladen werden.</Alert></div>}
              {app.reviewStatus !== "bereit_zur_uebermittlung" && <p className="mb-3 text-sm text-muted">Setzen Sie den Status zuerst auf „Bereit zur Übermittlung“.</p>}
              <TransmitForm applicationId={id} draft={draft} enabled={draft.emailActive && app.reviewStatus === "bereit_zur_uebermittlung"} />
            </Card>
          )}
          {transmitted && can(actor, "responses.upload") && (
            <div id="antwort">
              <Card title="Antwortdokument der Zentralstelle">
                {responses.length > 0 && (
                  <ul className="mb-4 space-y-1 text-sm">
                    {responses.map((r) => (
                      <li key={r.r.id}>
                        <a className="text-brand-700 hover:underline" href={`/api/dokumente/${r.r.documentId}`} target="_blank" rel="noopener">{r.fileName}</a>
                        <span className="text-muted"> · Eingang {formatDate(r.r.receivedOn)} · {r.by}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <ResponseUpload applicationId={id} customerLabel={`${f.lastName} ${f.firstName}, geb. ${formatDate(f.birthDate)}`} />
              </Card>
            </div>
          )}
          {subs.length > 0 && (
            <Card title="Versandprotokoll">
              <ul className="space-y-2 text-sm">
                {subs.map(({ s, by }) => (
                  <li key={s.id} className="rounded-lg border border-line p-2">
                    <div className="flex items-center justify-between">
                      <span>{s.recipient}</span>
                      {s.status === "sent" ? <Badge tone="green">Versendet</Badge> : s.status === "failed" ? <Badge tone="red">Fehlgeschlagen</Badge> : <Badge tone="amber">Ausstehend</Badge>}
                    </div>
                    <div className="text-xs text-muted">{formatDateTime(s.sentAt ?? s.createdAt)} · {by}{s.providerMessageId ? ` · ID ${s.providerMessageId}` : ""}</div>
                    {s.error && <div className="mt-1 text-xs text-red-700">{s.error}</div>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Historie"><StatusTimeline entries={history} /></Card>
          <Card title="Interne Notizen">
            {notes.length === 0 ? <p className="text-sm text-muted">Keine Notizen.</p> : (
              <ul className="space-y-2 text-sm">
                {notes.slice(0, 10).map((n) => <li key={n.note.id}><span className="text-xs text-muted">{formatDateTime(n.note.createdAt)} · {n.authorFirst} {n.authorLast}</span><div className="whitespace-pre-wrap">{n.note.body}</div></li>)}
              </ul>
            )}
            <Link href={`/kunden/${app.customerId}?tab=historie`} className="mt-3 inline-block text-sm text-brand-700 hover:underline">Alle Notizen ›</Link>
          </Card>
        </div>
      </div>
    </>
  );
}
