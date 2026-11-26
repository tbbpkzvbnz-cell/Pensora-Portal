"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { actorOrThrow } from "@/server/auth/session";
import { run, str } from "@/server/action-utils";
import { createCaptureLink, revokeCaptureLink, startApplication, submitManually } from "@/server/services/applications";
import { setOutcomeStatus, uploadResponse } from "@/server/services/review";
import { ValidationError } from "@/server/services/users";

export async function startApplicationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await run(fd, async () => {
    const actor = await actorOrThrow("applications.create");
    id = await startApplication(actor, str(fd, "customerId"));
  });
  if (res?.error) return res;
  redirect(`/antraege/${id}`);
}

export type LinkState = (NonNullable<ActionState> & { url?: string; expiresAt?: string }) | null;

export async function createLinkAction(_: LinkState, fd: FormData): Promise<LinkState> {
  let out: LinkState = null;
  const res = await run(fd, async () => {
    const actor = await actorOrThrow("applications.create");
    const r = await createCaptureLink(actor, str(fd, "applicationId"), str(fd, "sms") === "1");
    out = {
      url: r.url,
      expiresAt: r.expiresAt.toISOString(),
      ...(r.smsError ? { error: `Link erstellt, aber SMS-Versand fehlgeschlagen: ${r.smsError}` } : { success: str(fd, "sms") === "1" ? "Erfassungslink per SMS gesendet." : "Erfassungslink erstellt." }),
    };
  });
  revalidatePath(`/antraege/${str(fd, "applicationId")}`);
  return res?.error ? res : out;
}

export async function revokeLinkAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("applications.create");
    await revokeCaptureLink(actor, str(fd, "linkId"));
    revalidatePath(`/antraege/${str(fd, "applicationId")}`);
    return { success: "Link widerrufen." };
  });
}

export async function submitManuallyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("applications.create");
    await submitManually(actor, str(fd, "applicationId"));
    revalidatePath(`/antraege/${str(fd, "applicationId")}`);
    return { success: "Antrag an Pensora übergeben." };
  });
}

export async function setOutcomeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("applications.change_outcome");
    await setOutcomeStatus(actor, str(fd, "applicationId"), str(fd, "status"), str(fd, "note"));
    revalidatePath(`/antraege/${str(fd, "applicationId")}`);
    return { success: "Antragsstatus geändert." };
  });
}

export async function uploadResponseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(null, async () => {
    const actor = await actorOrThrow("responses.upload");
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ValidationError("Bitte PDF auswählen.", { file: "Pflichtfeld" });
    await uploadResponse(actor, str(fd, "applicationId"), Buffer.from(await file.arrayBuffer()), str(fd, "receivedOn"), str(fd, "ahvLast4"), fd.get("confirmed") === "on");
    revalidatePath(`/antraege/${str(fd, "applicationId")}`);
    return { success: "Antwortdokument gespeichert und der Kundenakte zugeordnet." };
  });
}
