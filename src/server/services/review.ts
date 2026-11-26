import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { applications, documents, responseDocuments, submissions, users } from "../db/schema";
import { assertCan, NotFoundError, type Actor } from "../authz";
import { logActivity, notify } from "../audit";
import { getEmailProvider } from "../integrations/email";
import { readDecrypted } from "../integrations/storage";
import { IntegrationInactiveError } from "../integrations/sms";
import { generateApplicationPdf, getApplication, recordStatus } from "./applications";
import { PDF_TYPES, storeDocument } from "./documents";
import { getSetting } from "./settings";
import { ValidationError } from "./users";
import { formatAhv } from "@/lib/ahv";
import { formatDate } from "@/lib/format";
import { OUTCOME_STATUS_LABELS, REVIEW_STATUS_LABELS, type OutcomeStatus, type ReviewStatus } from "@/lib/labels";

/** Statuses the back office may set manually ("uebermittelt" only via successful transmission). */
export const MANUAL_REVIEW_STATUSES: ReviewStatus[] = ["in_pruefung", "unterlagen_unvollstaendig", "rueckfrage_erforderlich", "bereit_zur_uebermittlung"];

export async function setReviewStatus(actor: Actor, applicationId: string, status: string, note: string) {
  assertCan(actor, "review.change_status");
  if (!MANUAL_REVIEW_STATUSES.includes(status as ReviewStatus)) throw new ValidationError("Ungültiger Status.");
  const app = await getApplication(actor, applicationId);
  if (app.phase !== "eingereicht") throw new ValidationError("Der Antrag wurde noch nicht an Pensora übergeben.");
  if (app.reviewStatus === "uebermittelt") throw new ValidationError("Der Antrag wurde bereits an die Zentralstelle übermittelt.");
  const needsNote = status === "unterlagen_unvollstaendig" || status === "rueckfrage_erforderlich";
  if (needsNote && note.trim().length < 5) throw new ValidationError("Bitte eine interne Notiz erfassen, was fehlt oder fehlerhaft ist.", { note: "Pflichtfeld" });
  if (status === app.reviewStatus) return;
  if (status === "bereit_zur_uebermittlung" && !app.docsComplete) throw new ValidationError("Unterlagen sind unvollständig – Status „Bereit zur Übermittlung“ nicht möglich.");
  await db.transaction(async (tx) => {
    await tx.update(applications).set({ reviewStatus: status as ReviewStatus, updatedAt: new Date() }).where(eq(applications.id, applicationId));
    await recordStatus(tx, applicationId, "review", app.reviewStatus, status, actor.id, note.trim() || null);
  });
  await logActivity({
    actor,
    action: "review.status",
    entityType: "application",
    entityId: applicationId,
    customerId: app.customerId,
    summary: `Prüfstatus: ${app.reviewStatus ? REVIEW_STATUS_LABELS[app.reviewStatus] : "–"} → ${REVIEW_STATUS_LABELS[status as ReviewStatus]}${note.trim() ? ` (${note.trim()})` : ""}`,
  });
  if (needsNote) {
    await notify([app.advisorId], {
      title: `${REVIEW_STATUS_LABELS[status as ReviewStatus]}: ${app.firstName} ${app.lastName}`,
      body: note.trim(),
      link: `/antraege/${applicationId}`,
    });
  }
}

/** Regenerates the complete PDF (e.g. after documents were replaced). */
export async function regeneratePdf(actor: Actor, applicationId: string) {
  assertCan(actor, "review.change_status");
  const app = await getApplication(actor, applicationId);
  await generateApplicationPdf(applicationId);
  await logActivity({ actor, action: "application.pdf", entityType: "application", entityId: applicationId, customerId: app.customerId, summary: "Antrags-PDF neu erstellt" });
}

function fill(tpl: string, app: Awaited<ReturnType<typeof getApplication>>) {
  return tpl
    .replaceAll("{nachname}", app.formData.lastName)
    .replaceAll("{vorname}", app.formData.firstName)
    .replaceAll("{geburtsdatum}", formatDate(app.formData.birthDate))
    .replaceAll("{ahv}", formatAhv(app.formData.ahvNumber));
}

export async function transmissionDraft(actor: Actor, applicationId: string) {
  assertCan(actor, "review.transmit");
  const app = await getApplication(actor, applicationId);
  return {
    recipient: String(await getSetting("zentralstelle_recipient")),
    subject: fill(String(await getSetting("zentralstelle_subject")), app),
    body: fill(String(await getSetting("zentralstelle_body")), app),
    emailActive: !!getEmailProvider(),
  };
}

const transmitInput = z.object({
  recipient: z.string().trim().email("Ungültige Empfängeradresse"),
  subject: z.string().trim().min(3, "Betreff fehlt").max(300),
  body: z.string().trim().min(10, "Text fehlt").max(10000),
});

/**
 * Sends the complete PDF to the Zentralstelle from the Pensora mailbox.
 * The application is only marked "Übermittelt" after the mail server accepted the message (§6.3).
 */
export async function transmit(actor: Actor, applicationId: string, raw: unknown) {
  assertCan(actor, "review.transmit");
  const p = transmitInput.safeParse(raw);
  if (!p.success) throw new ValidationError("Bitte Eingaben prüfen.", Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])));
  const app = await getApplication(actor, applicationId);
  if (app.reviewStatus !== "bereit_zur_uebermittlung") throw new ValidationError("Nur Anträge mit Status „Bereit zur Übermittlung“ können übermittelt werden.");
  if (!app.pdfDocumentId) throw new ValidationError("Das Antrags-PDF fehlt. Bitte PDF neu erstellen.");
  const provider = getEmailProvider();
  if (!provider) throw new IntegrationInactiveError("Die E-Mail-Schnittstelle");

  const [pdf] = await db.select().from(documents).where(eq(documents.id, app.pdfDocumentId));
  const [sub] = await db
    .insert(submissions)
    .values({ applicationId, recipient: p.data.recipient, subject: p.data.subject, body: p.data.body, attachmentDocumentId: pdf.id, provider: provider.name, triggeredBy: actor.id, status: "pending" })
    .returning({ id: submissions.id });

  try {
    const content = await readDecrypted(pdf.storageKey);
    const res = await provider.send({ to: p.data.recipient, subject: p.data.subject, text: p.data.body, attachments: [{ filename: pdf.fileName, content, contentType: "application/pdf" }] });
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(submissions).set({ status: "sent", sentAt: now, providerMessageId: res.messageId }).where(eq(submissions.id, sub.id));
      await tx.update(applications).set({ reviewStatus: "uebermittelt", transmittedAt: now, outcomeStatus: "warten_auf_antwort", updatedAt: now }).where(eq(applications.id, applicationId));
      await recordStatus(tx, applicationId, "review", app.reviewStatus, "uebermittelt", actor.id, `E-Mail an ${p.data.recipient}`);
      await recordStatus(tx, applicationId, "outcome", null, "warten_auf_antwort", actor.id, null);
    });
    await logActivity({ actor, action: "application.transmit", entityType: "application", entityId: applicationId, customerId: app.customerId, summary: `An Zentralstelle übermittelt (${p.data.recipient})` });
    await notify([app.advisorId], { title: `An Zentralstelle übermittelt: ${app.firstName} ${app.lastName}`, link: `/antraege/${applicationId}` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.update(submissions).set({ status: "failed", error: msg.slice(0, 1000) }).where(eq(submissions.id, sub.id));
    await logActivity({ actor, action: "application.transmit_failed", entityType: "application", entityId: applicationId, customerId: app.customerId, summary: `Übermittlung fehlgeschlagen: ${msg.slice(0, 200)}` });
    throw new ValidationError(`Versand fehlgeschlagen – der Antrag wurde NICHT als übermittelt markiert. Fehler: ${msg}`);
  }
}

export async function listSubmissions(actor: Actor, applicationId: string) {
  await getApplication(actor, applicationId);
  return db
    .select({ s: submissions, by: sql<string>`(select u.first_name || ' ' || u.last_name from ${users} u where u.id = ${submissions.triggeredBy})` })
    .from(submissions)
    .where(eq(submissions.applicationId, applicationId))
    .orderBy(desc(submissions.createdAt));
}

/* ------------------------- outcome (§7.3) ------------------------- */

export async function setOutcomeStatus(actor: Actor, applicationId: string, status: string, note: string) {
  assertCan(actor, "applications.change_outcome");
  if (!(status in OUTCOME_STATUS_LABELS)) throw new ValidationError("Ungültiger Status.");
  const app = await getApplication(actor, applicationId);
  if (app.reviewStatus !== "uebermittelt") throw new ValidationError("Der Antragsstatus kann erst nach der Übermittlung an die Zentralstelle geändert werden.");
  if (status === app.outcomeStatus) return;
  await db.transaction(async (tx) => {
    await tx.update(applications).set({ outcomeStatus: status as OutcomeStatus, updatedAt: new Date() }).where(eq(applications.id, applicationId));
    await recordStatus(tx, applicationId, "outcome", app.outcomeStatus, status, actor.id, note.trim() || null);
  });
  await logActivity({
    actor,
    action: "application.outcome",
    entityType: "application",
    entityId: applicationId,
    customerId: app.customerId,
    summary: `Antragsstatus: ${app.outcomeStatus ? OUTCOME_STATUS_LABELS[app.outcomeStatus] : "–"} → ${OUTCOME_STATUS_LABELS[status as OutcomeStatus]}`,
    changes: { outcomeStatus: { from: app.outcomeStatus, to: status } },
  });
  await notify([app.advisorId], { title: `${OUTCOME_STATUS_LABELS[status as OutcomeStatus]}: ${app.firstName} ${app.lastName}`, link: `/antraege/${applicationId}` });
}

/* ------------------------- response documents (§7.2) ------------------------- */

export async function uploadResponse(actor: Actor, applicationId: string, data: Buffer, receivedOn: string, confirmAhvLast4: string, confirmed: boolean) {
  assertCan(actor, "responses.upload");
  const app = await getApplication(actor, applicationId);
  if (app.reviewStatus !== "uebermittelt") throw new ValidationError("Antwortdokumente können nur zu übermittelten Anträgen erfasst werden.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedOn)) throw new ValidationError("Bitte Eingangsdatum erfassen.", { receivedOn: "Pflichtfeld" });
  if (!confirmed) throw new ValidationError("Bitte die Zuordnung zum Kunden ausdrücklich bestätigen.", { confirmed: "Pflicht" });
  if (confirmAhvLast4.replace(/\D/g, "") !== app.ahvNumber.slice(-4)) {
    throw new ValidationError("Die Kontrollziffern stimmen nicht mit der AHV-Nummer des gewählten Kunden überein. Bitte Zuordnung prüfen.", { confirmAhvLast4: "Stimmt nicht überein" });
  }
  const docId = await db.transaction(async (tx) => {
    const doc = await storeDocument(
      { customerId: app.customerId, applicationId, type: "response", data, allowed: PDF_TYPES, baseName: `Antwort_Zentralstelle_${app.lastName}_${receivedOn}`.replace(/[^A-Za-z0-9_.-]/g, "_"), uploadedBy: actor.id, receivedOn },
      tx,
    );
    await tx.insert(responseDocuments).values({ applicationId, documentId: doc.id, receivedOn, confirmedAhvLast4: confirmAhvLast4.replace(/\D/g, ""), createdBy: actor.id });
    return doc.id;
  });
  await logActivity({ actor, action: "response.upload", entityType: "document", entityId: docId, customerId: app.customerId, summary: `Antwortdokument der Zentralstelle erfasst (Eingang ${formatDate(receivedOn)})` });
  const gls = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "pensora_gl"), eq(users.status, "active"), isNull(users.deletedAt)));
  await notify(gls.map((g) => g.id), { title: `Antwort Zentralstelle eingegangen: ${app.firstName} ${app.lastName}`, body: "Bitte Antragsstatus aktualisieren.", link: `/antraege/${applicationId}` });
  return docId;
}

export async function listResponses(actor: Actor, applicationId: string) {
  await getApplication(actor, applicationId);
  return db
    .select({ r: responseDocuments, fileName: documents.fileName, by: sql<string>`(select u.first_name || ' ' || u.last_name from ${users} u where u.id = ${responseDocuments.createdBy})` })
    .from(responseDocuments)
    .innerJoin(documents, eq(documents.id, responseDocuments.documentId))
    .where(eq(responseDocuments.applicationId, applicationId))
    .orderBy(desc(responseDocuments.receivedOn));
}
