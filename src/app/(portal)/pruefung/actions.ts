"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { actorOrThrow } from "@/server/auth/session";
import { run, str } from "@/server/action-utils";
import { regeneratePdf, setReviewStatus, transmit } from "@/server/services/review";
import { addNote } from "@/server/services/notes";
import { getApplication } from "@/server/services/applications";

export async function setReviewStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("review.change_status");
    const id = str(fd, "applicationId");
    await setReviewStatus(actor, id, str(fd, "status"), str(fd, "note"));
    if (str(fd, "note").trim()) {
      const app = await getApplication(actor, id);
      await addNote(actor, app.customerId, `Prüfung: ${str(fd, "note").trim()}`, true);
    }
    revalidatePath(`/pruefung/${id}`);
    return { success: "Status gespeichert." };
  });
}

export async function transmitAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("review.transmit");
    await transmit(actor, str(fd, "applicationId"), { recipient: str(fd, "recipient"), subject: str(fd, "subject"), body: str(fd, "body") });
    revalidatePath(`/pruefung/${str(fd, "applicationId")}`);
    return { success: "E-Mail erfolgreich versendet. Der Antrag ist als übermittelt markiert." };
  });
}

export async function regeneratePdfAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("review.change_status");
    await regeneratePdf(actor, str(fd, "applicationId"));
    revalidatePath(`/pruefung/${str(fd, "applicationId")}`);
    return { success: "PDF neu erstellt." };
  });
}
