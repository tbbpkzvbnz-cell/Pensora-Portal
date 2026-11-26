import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { activityLog, noteRevisions, notes, users } from "../db/schema";
import { assertCan, AuthzError, can, isPensora, NotFoundError, type Actor } from "../authz";
import { logActivity } from "../audit";
import { assertCustomerAccess } from "./customers";
import { ValidationError } from "./users";

const body = z.string().trim().min(1, "Bitte Text eingeben").max(5000, "Maximal 5000 Zeichen");

export async function listNotes(actor: Actor, customerId: string) {
  await assertCustomerAccess(actor, customerId);
  const rows = await db
    .select({ note: notes, authorFirst: users.firstName, authorLast: users.lastName })
    .from(notes)
    .innerJoin(users, eq(users.id, notes.authorId))
    .where(and(eq(notes.customerId, customerId), can(actor, "notes.view_internal") ? undefined : eq(notes.internalOnly, false)))
    .orderBy(desc(notes.createdAt));
  const revs = rows.length
    ? await db
        .select({ rev: noteRevisions, editorFirst: users.firstName, editorLast: users.lastName })
        .from(noteRevisions)
        .innerJoin(users, eq(users.id, noteRevisions.editedBy))
        .innerJoin(notes, eq(notes.id, noteRevisions.noteId))
        .where(eq(notes.customerId, customerId))
        .orderBy(desc(noteRevisions.editedAt))
    : [];
  return rows.map((r) => ({ ...r, revisions: revs.filter((x) => x.rev.noteId === r.note.id) }));
}

export async function addNote(actor: Actor, customerId: string, text: string, internalOnly: boolean) {
  assertCan(actor, "notes.create");
  await assertCustomerAccess(actor, customerId);
  const p = body.safeParse(text);
  if (!p.success) throw new ValidationError(p.error.issues[0].message, { body: p.error.issues[0].message });
  const [n] = await db
    .insert(notes)
    .values({ customerId, body: p.data, authorId: actor.id, internalOnly: isPensora(actor) ? internalOnly : false })
    .returning({ id: notes.id });
  await logActivity({ actor, action: "note.create", entityType: "note", entityId: n.id, customerId, summary: "Notiz erfasst" });
  return n.id;
}

/** Only the author may edit; the previous text is kept as a revision (no silent overwrite). */
export async function editNote(actor: Actor, noteId: string, text: string) {
  const [n] = await db.select().from(notes).where(eq(notes.id, noteId));
  if (!n) throw new NotFoundError();
  await assertCustomerAccess(actor, n.customerId);
  if (n.authorId !== actor.id) throw new AuthzError("Nur der Verfasser kann eine Notiz bearbeiten.");
  const p = body.safeParse(text);
  if (!p.success) throw new ValidationError(p.error.issues[0].message);
  if (p.data === n.body) return;
  await db.transaction(async (tx) => {
    await tx.insert(noteRevisions).values({ noteId, previousBody: n.body, editedBy: actor.id });
    await tx.update(notes).set({ body: p.data, editedAt: new Date() }).where(eq(notes.id, noteId));
  });
  await logActivity({ actor, action: "note.edit", entityType: "note", entityId: noteId, customerId: n.customerId, summary: "Notiz bearbeitet (alte Version gespeichert)" });
}

/** Customer history = audit-log entries of this customer. */
export async function customerHistory(actor: Actor, customerId: string, limit = 200) {
  await assertCustomerAccess(actor, customerId);
  return db
    .select({ id: activityLog.id, action: activityLog.action, summary: activityLog.summary, actorLabel: activityLog.actorLabel, createdAt: activityLog.createdAt, changes: activityLog.changes })
    .from(activityLog)
    .where(and(eq(activityLog.customerId, customerId)))
    .orderBy(desc(activityLog.createdAt))
    .limit(limit);
}
