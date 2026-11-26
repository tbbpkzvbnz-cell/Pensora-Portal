import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, type Tx } from "../db";
import { applications, documents, users } from "../db/schema";
import { assertCan, AuthzError, can, NotFoundError, type Actor } from "../authz";
import { readDecrypted, storeEncrypted } from "../integrations/storage";
import { sha256 } from "../lib/crypto";
import { logActivity } from "../audit";
import { assertCustomerAccess, recomputeIntakeStatus } from "./customers";
import { ValidationError } from "./users";
import type { DocumentType } from "@/lib/labels";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "application/pdf", ext: "pdf", test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/webp", ext: "webp", test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  { mime: "image/heic", ext: "heic", test: (b) => b.subarray(4, 8).toString("latin1") === "ftyp" && /heic|heix|mif1|msf1|hevc/.test(b.subarray(8, 12).toString("latin1")) },
];

/** Detects the real file type from magic bytes; never trusts the client MIME type. */
export function sniff(buf: Buffer, allowed: string[]): { mime: string; ext: string } {
  const hit = SIGNATURES.find((s) => s.test(buf));
  if (!hit || !allowed.includes(hit.mime)) throw new ValidationError(`Dateiformat nicht erlaubt. Erlaubt: ${allowed.map((m) => m.split("/")[1].toUpperCase()).join(", ")}`);
  return hit;
}

export const IMAGE_TYPES = ["image/jpeg", "image/png"];
export const PDF_TYPES = ["application/pdf"];

type StoreInput = {
  customerId: string;
  applicationId?: string | null;
  type: DocumentType;
  data: Buffer;
  allowed: string[];
  baseName: string;
  uploadedBy?: string | null;
  uploadedViaLinkId?: string | null;
  receivedOn?: string | null;
  /** mark older documents of the same type for this customer as superseded */
  supersede?: boolean;
};

/** Low-level: assumes authorization was checked by the caller. */
export async function storeDocument(input: StoreInput, tx: Tx | typeof db = db) {
  if (input.data.length === 0) throw new ValidationError("Die Datei ist leer.");
  if (input.data.length > MAX_UPLOAD_BYTES) throw new ValidationError("Die Datei ist zu gross (max. 10 MB).");
  const kind = sniff(input.data, input.allowed);
  const storageKey = await storeEncrypted(`customers/${input.customerId}`, input.data);
  if (input.supersede) {
    await tx
      .update(documents)
      .set({ supersededAt: new Date() })
      .where(
        and(
          eq(documents.customerId, input.customerId),
          eq(documents.type, input.type),
          isNull(documents.supersededAt),
        ),
      );
  }
  const [doc] = await tx
    .insert(documents)
    .values({
      customerId: input.customerId,
      applicationId: input.applicationId ?? null,
      type: input.type,
      fileName: `${input.baseName}.${kind.ext}`,
      mimeType: kind.mime,
      sizeBytes: input.data.length,
      sha256: sha256(input.data),
      storageKey,
      uploadedBy: input.uploadedBy ?? null,
      uploadedViaLinkId: input.uploadedViaLinkId ?? null,
      receivedOn: input.receivedOn ?? null,
    })
    .returning();
  return doc;
}

export async function listCustomerDocuments(actor: Actor, customerId: string) {
  await assertCustomerAccess(actor, customerId);
  return db
    .select({
      id: documents.id,
      type: documents.type,
      fileName: documents.fileName,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      applicationId: documents.applicationId,
      receivedOn: documents.receivedOn,
      supersededAt: documents.supersededAt,
      createdAt: documents.createdAt,
      uploadedByName: users.lastName,
      uploadedByFirst: users.firstName,
      viaLink: documents.uploadedViaLinkId,
    })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.uploadedBy))
    .where(and(eq(documents.customerId, customerId), isNull(documents.deletedAt)))
    .orderBy(desc(documents.createdAt));
}

/** Authorized read of a document (download/preview). Logs every access. */
export async function readDocument(actor: Actor, documentId: string) {
  const [doc] = await db.select().from(documents).where(and(eq(documents.id, documentId), isNull(documents.deletedAt)));
  if (!doc) throw new NotFoundError();
  await assertCustomerAccess(actor, doc.customerId);
  // Backoffice only for documents of submitted applications or response documents.
  if (actor.role === "pensora_backoffice" && doc.applicationId) {
    const [a] = await db.select({ phase: applications.phase }).from(applications).where(eq(applications.id, doc.applicationId));
    if (a?.phase !== "eingereicht") throw new NotFoundError();
  }
  const data = await readDecrypted(doc.storageKey);
  await logActivity({ actor, action: "document.view", entityType: "document", entityId: doc.id, customerId: doc.customerId, summary: `Dokument geöffnet: ${doc.fileName}` });
  return { doc, data };
}

/** Advisor/GL upload of ID copies directly in the customer file. */
export async function uploadCustomerDocument(actor: Actor, customerId: string, type: DocumentType, data: Buffer) {
  if (!["id_front", "id_back", "other"].includes(type)) throw new ValidationError("Ungültiger Dokumenttyp.");
  if (!can(actor, "customers.edit") && !can(actor, "applications.create")) throw new AuthzError();
  await assertCustomerAccess(actor, customerId);
  const doc = await db.transaction(async (tx) => {
    const d = await storeDocument(
      { customerId, type, data, allowed: type === "other" ? [...IMAGE_TYPES, ...PDF_TYPES] : [...IMAGE_TYPES, ...PDF_TYPES], baseName: type, uploadedBy: actor.id, supersede: type !== "other" },
      tx,
    );
    await recomputeIntakeStatus(customerId, tx);
    return d;
  });
  await logActivity({ actor, action: "document.upload", entityType: "document", entityId: doc.id, customerId, summary: `Dokument hochgeladen: ${doc.fileName}` });
  return doc.id;
}

export function assertPermissionForDocs(actor: Actor) {
  assertCan(actor, "customers.view");
}
