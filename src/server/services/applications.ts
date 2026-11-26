import "server-only";
import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db, type Tx } from "../db";
import {
  applicationStatusHistory,
  applications,
  brokerFirms,
  captureLinks,
  customers,
  documents,
  users,
  type FormSnapshot,
} from "../db/schema";
import { applicationScope, assertCan, AuthzError, NotFoundError, type Actor } from "../authz";
import { logActivity, notify } from "../audit";
import { randomToken, sha256 } from "../lib/crypto";
import { sendSms } from "../integrations/sms";
import { readDecrypted } from "../integrations/storage";
import { renderVollmacht, type IdAttachment } from "../pdf/vollmacht";
import { assertCustomerAccess, getCustomer, recomputeIntakeStatus, REQUIRED_DOCS } from "./customers";
import { IMAGE_TYPES, PDF_TYPES, storeDocument } from "./documents";
import { ValidationError } from "./users";
import { getSetting } from "./settings";
import { env } from "../env";
import { todayZurich } from "@/lib/format";
import type { OutcomeStatus, ReviewStatus } from "@/lib/labels";

const OPEN_OUTCOMES: OutcomeStatus[] = ["warten_auf_antwort", "rueckmeldung_erhalten"];

/* ---------------------------------------------------------------- */
/* Reads                                                            */
/* ---------------------------------------------------------------- */

const advisorName = sql<string>`(select u.first_name || ' ' || u.last_name from ${users} u where u.id = ${applications.advisorId})`;

const appColumns = {
  id: applications.id,
  customerId: applications.customerId,
  phase: applications.phase,
  applicationDate: applications.applicationDate,
  createdAt: applications.createdAt,
  submittedToPensoraAt: applications.submittedToPensoraAt,
  reviewStatus: applications.reviewStatus,
  outcomeStatus: applications.outcomeStatus,
  transmittedAt: applications.transmittedAt,
  pdfDocumentId: applications.pdfDocumentId,
  firstName: customers.firstName,
  lastName: customers.lastName,
  birthDate: customers.birthDate,
  ahvNumber: customers.ahvNumber,
  phone: customers.phone,
  email: customers.email,
  advisorId: applications.advisorId,
  advisorName,
  brokerName: brokerFirms.name,
  docsComplete: sql<boolean>`(select count(distinct d.type) = 3 from ${documents} d where d.application_id = ${applications.id} and d.type in ('id_front','id_back','signature') and d.deleted_at is null and d.superseded_at is null)`,
};

export type ApplicationListFilter = {
  q?: string;
  brokerFirmId?: string;
  advisorId?: string;
  outcome?: string;
  review?: string;
  view?: "eingereicht" | "alle" | "pruefung" | "uebermittelt";
  from?: string;
  to?: string;
  dateField?: "submitted" | "transmitted";
  sort?: string;
  dir?: string;
  page?: number;
  pageSize?: number;
};

const SORT: Record<string, SQL | AnyPgColumn> = {
  name: sql`${customers.lastName} || ' ' || ${customers.firstName}`,
  eingang: applications.submittedToPensoraAt,
  uebermittelt: applications.transmittedAt,
  erstellt: applications.createdAt,
};

export async function listApplications(actor: Actor, f: ApplicationListFilter) {
  assertCan(actor, "applications.view");
  if ((f.view === "pruefung" || f.view === "uebermittelt") && !actor.permissions.has("review.access")) throw new AuthzError();
  const conds: SQL[] = [applicationScope(actor)];
  if (f.view === "eingereicht") conds.push(eq(applications.phase, "eingereicht"));
  if (f.view === "pruefung") conds.push(eq(applications.phase, "eingereicht"), ne(applications.reviewStatus, "uebermittelt"));
  if (f.view === "uebermittelt") conds.push(eq(applications.reviewStatus, "uebermittelt"));
  if (f.q) {
    const like = `%${f.q.trim()}%`;
    conds.push(or(ilike(customers.firstName, like), ilike(customers.lastName, like), sql`(${customers.firstName} || ' ' || ${customers.lastName}) ilike ${like}`, sql`(${customers.lastName} || ' ' || ${customers.firstName}) ilike ${like}`)!);
  }
  if (f.brokerFirmId === "pensora") conds.push(isNull(applications.brokerFirmId));
  else if (f.brokerFirmId) conds.push(eq(applications.brokerFirmId, f.brokerFirmId));
  if (f.advisorId) conds.push(eq(applications.advisorId, f.advisorId));
  if (f.outcome) conds.push(eq(applications.outcomeStatus, f.outcome as OutcomeStatus));
  if (f.review) conds.push(eq(applications.reviewStatus, f.review as ReviewStatus));
  const dateCol = f.dateField === "transmitted" ? applications.transmittedAt : applications.submittedToPensoraAt;
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) conds.push(sql`${dateCol} >= (${f.from}::date at time zone 'Europe/Zurich')`);
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) conds.push(sql`${dateCol} < ((${f.to}::date + 1) at time zone 'Europe/Zurich')`);

  const pageSize = Math.min(Math.max(f.pageSize ?? 25, 10), 5000);
  const page = Math.max(f.page ?? 1, 1);
  const sortCol: SQL | AnyPgColumn = SORT[f.sort ?? ""] ?? (f.view === "uebermittelt" ? applications.transmittedAt : f.view === "alle" ? applications.createdAt : applications.submittedToPensoraAt);
  const order = f.dir === "asc" ? sql`${sortCol} asc nulls last` : sql`${sortCol} desc nulls last`;
  const where = and(...conds);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select(appColumns)
      .from(applications)
      .innerJoin(customers, eq(customers.id, applications.customerId))
      .leftJoin(brokerFirms, eq(brokerFirms.id, applications.brokerFirmId))
      .where(where)
      .orderBy(order, asc(applications.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(applications).innerJoin(customers, eq(customers.id, applications.customerId)).where(where),
  ]);
  return { rows, total, page, pageSize };
}

export async function getApplication(actor: Actor, id: string) {
  assertCan(actor, "applications.view");
  if (!z.string().uuid().safeParse(id).success) throw new NotFoundError();
  const [row] = await db
    .select({ ...appColumns, formData: applications.formData, city: customers.city })
    .from(applications)
    .innerJoin(customers, eq(customers.id, applications.customerId))
    .leftJoin(brokerFirms, eq(brokerFirms.id, applications.brokerFirmId))
    .where(and(eq(applications.id, id), applicationScope(actor)));
  if (!row) throw new NotFoundError();
  return row;
}

export async function listCustomerApplications(actor: Actor, customerId: string) {
  await assertCustomerAccess(actor, customerId);
  return db
    .select(appColumns)
    .from(applications)
    .innerJoin(customers, eq(customers.id, applications.customerId))
    .leftJoin(brokerFirms, eq(brokerFirms.id, applications.brokerFirmId))
    .where(and(eq(applications.customerId, customerId), applicationScope(actor)))
    .orderBy(desc(applications.createdAt));
}

export async function applicationHistory(actor: Actor, applicationId: string) {
  await getApplication(actor, applicationId);
  return db
    .select({ h: applicationStatusHistory, by: sql<string | null>`(select u.first_name || ' ' || u.last_name from ${users} u where u.id = ${applicationStatusHistory.changedBy})` })
    .from(applicationStatusHistory)
    .where(eq(applicationStatusHistory.applicationId, applicationId))
    .orderBy(desc(applicationStatusHistory.changedAt));
}

export async function applicationDocuments(actor: Actor, applicationId: string) {
  await getApplication(actor, applicationId);
  return db
    .select({ id: documents.id, type: documents.type, fileName: documents.fileName, mimeType: documents.mimeType, createdAt: documents.createdAt, receivedOn: documents.receivedOn, supersededAt: documents.supersededAt })
    .from(documents)
    .where(and(eq(documents.applicationId, applicationId), isNull(documents.deletedAt)))
    .orderBy(desc(documents.createdAt));
}

export async function listCaptureLinks(actor: Actor, applicationId: string) {
  await getApplication(actor, applicationId);
  return db.select().from(captureLinks).where(eq(captureLinks.applicationId, applicationId)).orderBy(desc(captureLinks.createdAt));
}

/* ---------------------------------------------------------------- */
/* Status history helper                                            */
/* ---------------------------------------------------------------- */

export async function recordStatus(
  tx: Tx | typeof db,
  applicationId: string,
  kind: "review" | "outcome" | "intake",
  oldStatus: string | null,
  newStatus: string,
  changedBy: string | null,
  note?: string | null,
) {
  await tx.insert(applicationStatusHistory).values({ applicationId, kind, oldStatus, newStatus, changedBy, note: note ?? null });
}

/* ---------------------------------------------------------------- */
/* Advisor: start application, capture link                         */
/* ---------------------------------------------------------------- */

function snapshot(c: typeof customers.$inferSelect): FormSnapshot {
  return {
    lastName: c.lastName,
    firstName: c.firstName,
    birthDate: c.birthDate,
    ahvNumber: c.ahvNumber,
    street: c.street,
    postalCode: c.postalCode,
    city: c.city,
    phone: c.phone,
    email: c.email,
  };
}

export async function findOpenApplication(customerId: string) {
  const [open] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.customerId, customerId),
        or(
          eq(applications.phase, "entwurf"),
          and(eq(applications.phase, "eingereicht"), isNull(applications.outcomeStatus)),
          inArray(applications.outcomeStatus, OPEN_OUTCOMES),
        ),
      ),
    )
    .limit(1);
  return open?.id ?? null;
}

export async function startApplication(actor: Actor, customerId: string) {
  assertCan(actor, "applications.create");
  const { customer } = await getCustomer(actor, customerId);
  const open = await findOpenApplication(customerId);
  if (open) throw new ValidationError("Für diesen Kunden besteht bereits ein offener Antrag.");
  const id = await db.transaction(async (tx) => {
    const [a] = await tx
      .insert(applications)
      .values({
        customerId,
        advisorId: customer.advisorId,
        brokerFirmId: customer.brokerFirmId,
        formData: snapshot(customer),
        applicationDate: todayZurich(),
        createdBy: actor.id,
      })
      .returning({ id: applications.id });
    await recordStatus(tx, a.id, "intake", null, "entwurf", actor.id, "Freizügigkeitsanfrage gestartet");
    await recomputeIntakeStatus(customerId, tx);
    return a.id;
  });
  await logActivity({ actor, action: "application.create", entityType: "application", entityId: id, customerId, summary: "Freizügigkeitsanfrage gestartet" });
  return id;
}

/** While in draft, the form snapshot follows the master data (data is entered only once). */
async function syncDraftSnapshot(applicationId: string) {
  const [row] = await db
    .select({ a: applications, c: customers })
    .from(applications)
    .innerJoin(customers, eq(customers.id, applications.customerId))
    .where(eq(applications.id, applicationId));
  if (!row || row.a.phase !== "entwurf") return row?.a.formData;
  const snap = snapshot(row.c);
  await db.update(applications).set({ formData: snap, applicationDate: todayZurich(), updatedAt: new Date() }).where(eq(applications.id, applicationId));
  return snap;
}

const LINK_HOURS_DEFAULT = 72;

export async function createCaptureLink(actor: Actor, applicationId: string, sendViaSms: boolean) {
  assertCan(actor, "applications.create");
  const app = await getApplication(actor, applicationId);
  if (app.phase !== "entwurf" && !(app.reviewStatus === "unterlagen_unvollstaendig" || app.reviewStatus === "rueckfrage_erforderlich")) {
    throw new ValidationError("Für diesen Antrag kann kein Erfassungslink mehr erstellt werden.");
  }
  const hours = Number((await getSetting("capture_link_hours")) ?? LINK_HOURS_DEFAULT) || LINK_HOURS_DEFAULT;
  const token = randomToken(32);
  const url = `${env.APP_URL}/erfassung/${token}`;
  const [link] = await db.transaction(async (tx) => {
    await tx
      .update(captureLinks)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(and(eq(captureLinks.applicationId, applicationId), eq(captureLinks.status, "active")));
    return tx
      .insert(captureLinks)
      .values({ applicationId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + hours * 3600_000), createdBy: actor.id, sentTo: sendViaSms ? app.phone : null })
      .returning();
  });
  let smsError: string | null = null;
  if (sendViaSms) {
    try {
      await sendSms(
        app.phone,
        `Guten Tag ${app.firstName} ${app.lastName}. Bitte erfassen Sie Ihre ID und Unterschrift für die Pensora-Vollmacht: ${url} (gültig ${hours} Std.)`,
      );
      await db.update(captureLinks).set({ smsSentAt: new Date() }).where(eq(captureLinks.id, link.id));
    } catch (e) {
      smsError = e instanceof Error ? e.message : "SMS-Versand fehlgeschlagen";
      await db.update(captureLinks).set({ smsError }).where(eq(captureLinks.id, link.id));
    }
  }
  await logActivity({
    actor,
    action: "capture_link.create",
    entityType: "application",
    entityId: applicationId,
    customerId: app.customerId,
    summary: sendViaSms ? (smsError ? `Erfassungslink erstellt, SMS fehlgeschlagen: ${smsError}` : "Erfassungslink per SMS gesendet") : "Erfassungslink erstellt (ohne SMS)",
  });
  return { url, smsError, expiresAt: link.expiresAt };
}

export async function revokeCaptureLink(actor: Actor, linkId: string) {
  assertCan(actor, "applications.create");
  const [l] = await db.select().from(captureLinks).where(eq(captureLinks.id, linkId));
  if (!l) throw new NotFoundError();
  const app = await getApplication(actor, l.applicationId);
  await db.update(captureLinks).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(captureLinks.id, linkId), eq(captureLinks.status, "active")));
  await logActivity({ actor, action: "capture_link.revoke", entityType: "application", entityId: l.applicationId, customerId: app.customerId, summary: "Erfassungslink widerrufen" });
}

/* ---------------------------------------------------------------- */
/* Public capture flow (customer, no login)                          */
/* ---------------------------------------------------------------- */

export async function resolveCaptureToken(token: string) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const [row] = await db
    .select({ link: captureLinks, app: applications, c: customers })
    .from(captureLinks)
    .innerJoin(applications, eq(applications.id, captureLinks.applicationId))
    .innerJoin(customers, eq(customers.id, applications.customerId))
    .where(eq(captureLinks.tokenHash, sha256(token)));
  if (!row) return null;
  if (row.link.status === "active" && row.link.expiresAt < new Date()) {
    await db.update(captureLinks).set({ status: "expired" }).where(eq(captureLinks.id, row.link.id));
    row.link.status = "expired";
  }
  const existing = await db
    .select({ type: documents.type })
    .from(documents)
    .where(and(eq(documents.customerId, row.c.id), isNull(documents.deletedAt), isNull(documents.supersededAt), inArray(documents.type, ["id_front", "id_back"])));
  return {
    linkId: row.link.id,
    status: row.link.status,
    expiresAt: row.link.expiresAt,
    applicationId: row.app.id,
    customerId: row.c.id,
    // Only minimal data is shown on the public page.
    displayName: `${row.c.firstName} ${row.c.lastName.charAt(0)}.`,
    hasIdFront: existing.some((e) => e.type === "id_front"),
    hasIdBack: existing.some((e) => e.type === "id_back"),
  };
}

export async function completeCapture(token: string, files: { idFront: Buffer | null; idBack: Buffer | null; signature: Buffer }) {
  const ctx = await resolveCaptureToken(token);
  if (!ctx || ctx.status !== "active") throw new ValidationError("Dieser Link ist nicht mehr gültig. Bitte wenden Sie sich an Ihren Berater.");
  if (!files.idFront && !ctx.hasIdFront) throw new ValidationError("Bitte Vorderseite der ID erfassen.");
  if (!files.idBack && !ctx.hasIdBack) throw new ValidationError("Bitte Rückseite der ID erfassen.");

  // Claim the link atomically (one-time use).
  const claimed = await db
    .update(captureLinks)
    .set({ uses: sql`${captureLinks.uses} + 1` })
    .where(and(eq(captureLinks.id, ctx.linkId), eq(captureLinks.status, "active"), gt(captureLinks.expiresAt, new Date()), sql`${captureLinks.uses} < ${captureLinks.maxUses}`))
    .returning({ id: captureLinks.id });
  if (claimed.length === 0) throw new ValidationError("Dieser Link wurde bereits verwendet.");

  try {
    await db.transaction(async (tx) => {
      const common = { customerId: ctx.customerId, applicationId: ctx.applicationId, uploadedViaLinkId: ctx.linkId, supersede: true };
      if (files.idFront) await storeDocument({ ...common, type: "id_front", data: files.idFront, allowed: IMAGE_TYPES, baseName: "ID_Vorderseite" }, tx);
      if (files.idBack) await storeDocument({ ...common, type: "id_back", data: files.idBack, allowed: IMAGE_TYPES, baseName: "ID_Rueckseite" }, tx);
      await storeDocument({ ...common, type: "signature", data: files.signature, allowed: ["image/png"], baseName: "Unterschrift" }, tx);
      // Attach previously uploaded ID copies of the customer to this application.
      await tx
        .update(documents)
        .set({ applicationId: ctx.applicationId })
        .where(and(eq(documents.customerId, ctx.customerId), isNull(documents.applicationId), isNull(documents.supersededAt), inArray(documents.type, ["id_front", "id_back"])));
      await tx.update(captureLinks).set({ status: "completed", completedAt: new Date() }).where(eq(captureLinks.id, ctx.linkId));
    });
  } catch (e) {
    await db.update(captureLinks).set({ uses: sql`greatest(${captureLinks.uses} - 1, 0)` }).where(eq(captureLinks.id, ctx.linkId));
    throw e;
  }

  await logActivity({ actor: null, actorLabel: "Kunde (Erfassungslink)", action: "capture.complete", entityType: "application", entityId: ctx.applicationId, customerId: ctx.customerId, summary: "Kunde hat ID und Unterschrift erfasst" });
  await submitToPensora(ctx.applicationId);
}

/* ---------------------------------------------------------------- */
/* PDF + automatic hand-over to Pensora                              */
/* ---------------------------------------------------------------- */

async function currentDoc(applicationId: string, customerId: string, type: "id_front" | "id_back" | "signature") {
  const [d] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.customerId, customerId), eq(documents.type, type), isNull(documents.deletedAt), isNull(documents.supersededAt)))
    .orderBy(sql`(${documents.applicationId} = ${applicationId}) desc nulls last`, desc(documents.createdAt))
    .limit(1);
  return d ?? null;
}

/** Builds the complete PDF (original form + signature + ID copies) and stores it as a document. */
export async function generateApplicationPdf(applicationId: string, tx: Tx | typeof db = db) {
  const [a] = await tx.select().from(applications).where(eq(applications.id, applicationId));
  if (!a) throw new NotFoundError();
  const [front, back, sig] = await Promise.all([
    currentDoc(applicationId, a.customerId, "id_front"),
    currentDoc(applicationId, a.customerId, "id_back"),
    currentDoc(applicationId, a.customerId, "signature"),
  ]);
  if (!front || !back || !sig) throw new ValidationError("Unterlagen unvollständig: ID-Vorderseite, ID-Rückseite und Unterschrift sind erforderlich.");
  const att = async (d: typeof front, label: string): Promise<IdAttachment> => ({ data: await readDecrypted(d.storageKey), mime: d.mimeType, label });
  const pdf = await renderVollmacht({
    form: a.formData,
    applicationDate: a.applicationDate,
    signaturePng: await readDecrypted(sig.storageKey),
    idFront: await att(front, "Vorderseite"),
    idBack: await att(back, "Rückseite"),
  });
  const doc = await storeDocument(
    {
      customerId: a.customerId,
      applicationId,
      type: "vollmacht_pdf",
      data: pdf,
      allowed: PDF_TYPES,
      baseName: `Vollmacht_${a.formData.lastName}_${a.formData.firstName}_${a.applicationDate}`.replace(/[^A-Za-z0-9_.-]/g, "_"),
      supersede: true,
    },
    tx,
  );
  await tx.update(applications).set({ pdfDocumentId: doc.id, updatedAt: new Date() }).where(eq(applications.id, applicationId));
  return doc.id;
}

/** Preview of the filled form (no signature/IDs needed), never stored. */
export async function previewApplicationPdf(actor: Actor, applicationId: string) {
  const app = await getApplication(actor, applicationId);
  const form = app.phase === "entwurf" ? await syncDraftSnapshot(applicationId) : app.formData;
  const sig = await currentDoc(applicationId, app.customerId, "signature");
  return renderVollmacht({
    form: form!,
    applicationDate: app.phase === "entwurf" ? todayZurich() : app.applicationDate,
    signaturePng: sig && app.phase !== "entwurf" ? await readDecrypted(sig.storageKey) : null,
    preview: true,
  });
}

/**
 * Hand-over to Pensora: freezes the snapshot, generates the PDF, sets the official search timestamp.
 * Called automatically after the capture is complete (§5.4). Re-submissions after "Rückfrage" reset the review status.
 */
export async function submitToPensora(applicationId: string, actor: Actor | null = null) {
  await syncDraftSnapshot(applicationId);
  const result = await db.transaction(async (tx) => {
    const [a] = await tx.select().from(applications).where(eq(applications.id, applicationId)).for("update");
    if (!a) throw new NotFoundError();
    await generateApplicationPdf(applicationId, tx);
    const first = a.phase === "entwurf";
    const now = new Date();
    await tx
      .update(applications)
      .set({
        phase: "eingereicht",
        submittedToPensoraAt: first ? now : a.submittedToPensoraAt,
        reviewStatus: "neu_eingegangen",
        updatedAt: now,
      })
      .where(eq(applications.id, applicationId));
    await recordStatus(tx, applicationId, "review", a.reviewStatus, "neu_eingegangen", actor?.id ?? null, first ? "Automatisch an Pensora übergeben" : "Unterlagen nachgereicht");
    await recomputeIntakeStatus(a.customerId, tx);
    return { customerId: a.customerId, advisorId: a.advisorId, first, name: `${a.formData.firstName} ${a.formData.lastName}` };
  });
  await logActivity({
    actor,
    actorLabel: actor ? undefined : "System",
    action: "application.submit",
    entityType: "application",
    entityId: applicationId,
    customerId: result.customerId,
    summary: result.first ? "Antrag an Pensora übergeben (offizieller Zeitpunkt der Suchanfrage)" : "Nachgereichte Unterlagen an Pensora übergeben",
  });
  const reviewers = await db.select({ id: users.id }).from(users).where(and(inArray(users.role, ["pensora_backoffice", "pensora_gl"]), eq(users.status, "active"), isNull(users.deletedAt)));
  await notify([result.advisorId], { title: `Erfassung abgeschlossen: ${result.name}`, body: "ID und Unterschrift wurden erfasst, der Antrag wurde an Pensora übergeben.", link: `/antraege/${applicationId}` });
  await notify(reviewers.map((r) => r.id), { title: `Neuer Antrag eingegangen: ${result.name}`, link: `/pruefung/${applicationId}` });
}

/** Advisor can submit manually when all documents are already on file (e.g. uploaded in portal + signature captured earlier). */
export async function submitManually(actor: Actor, applicationId: string) {
  assertCan(actor, "applications.create");
  const app = await getApplication(actor, applicationId);
  const resubmit = app.reviewStatus === "unterlagen_unvollstaendig" || app.reviewStatus === "rueckfrage_erforderlich";
  if (app.phase !== "entwurf" && !resubmit) throw new ValidationError("Der Antrag wurde bereits an Pensora übergeben.");
  const missing: string[] = [];
  for (const t of REQUIRED_DOCS) if (!(await currentDoc(applicationId, app.customerId, t))) missing.push(t);
  if (missing.length) throw new ValidationError("Unterlagen unvollständig. Bitte Erfassungslink an den Kunden senden.");
  await submitToPensora(applicationId, actor);
}

