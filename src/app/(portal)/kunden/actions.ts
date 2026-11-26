"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { actorOrThrow } from "@/server/auth/session";
import { run, str } from "@/server/action-utils";
import { createCustomer, reassignCustomer, updateCustomer } from "@/server/services/customers";
import { addNote, editNote } from "@/server/services/notes";
import { uploadCustomerDocument } from "@/server/services/documents";
import { ValidationError } from "@/server/services/users";
import type { DocumentType } from "@/lib/labels";

const data = (fd: FormData) => ({
  firstName: str(fd, "firstName"),
  lastName: str(fd, "lastName"),
  birthDate: str(fd, "birthDate"),
  ahvNumber: str(fd, "ahvNumber"),
  street: str(fd, "street"),
  postalCode: str(fd, "postalCode"),
  city: str(fd, "city"),
  phone: str(fd, "phone"),
  email: str(fd, "email"),
});

export async function createCustomerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await run(fd, async () => {
    const actor = await actorOrThrow("customers.create");
    id = await createCustomer(actor, data(fd), str(fd, "advisorId") || null);
  });
  if (res?.error) return res;
  redirect(`/kunden/${id}?neu=1`);
}

export async function updateCustomerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "id");
  const res = await run(fd, async () => {
    const actor = await actorOrThrow("customers.edit");
    await updateCustomer(actor, id, data(fd));
  });
  if (res?.error) return res;
  redirect(`/kunden/${id}`);
}

export async function reassignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("customers.reassign");
    await reassignCustomer(actor, str(fd, "id"), str(fd, "advisorId"));
    revalidatePath(`/kunden/${str(fd, "id")}`);
    return { success: "Berater geändert." };
  });
}

export async function addNoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("notes.create");
    await addNote(actor, str(fd, "customerId"), str(fd, "body"), fd.get("internalOnly") === "on");
    revalidatePath(`/kunden/${str(fd, "customerId")}`);
    revalidatePath(`/portfolio/${str(fd, "customerId")}`);
    return { success: "Notiz gespeichert." };
  });
}

export async function editNoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow();
    await editNote(actor, str(fd, "noteId"), str(fd, "body"));
    revalidatePath(`/kunden/${str(fd, "customerId")}`);
    return { success: "Notiz aktualisiert." };
  });
}

export async function uploadDocumentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(null, async () => {
    const actor = await actorOrThrow();
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ValidationError("Bitte eine Datei auswählen.");
    await uploadCustomerDocument(actor, str(fd, "customerId"), str(fd, "type") as DocumentType, Buffer.from(await file.arrayBuffer()));
    revalidatePath(`/kunden/${str(fd, "customerId")}`);
    return { success: "Dokument hochgeladen." };
  });
}
