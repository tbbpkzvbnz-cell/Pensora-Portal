"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { actorOrThrow } from "@/server/auth/session";
import { run, str } from "@/server/action-utils";
import { adminResetPassword, createUser, deleteUser, setUserStatus, updateUser } from "@/server/services/users";
import { createBroker, setBrokerActive, updateBroker } from "@/server/services/brokers";

const userData = (fd: FormData) => ({
  firstName: str(fd, "firstName"),
  lastName: str(fd, "lastName"),
  email: str(fd, "email"),
  phone: str(fd, "phone"),
  role: str(fd, "role"),
  brokerFirmId: str(fd, "brokerFirmId") || null,
});

export async function createUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await run(fd, async () => {
    const actor = await actorOrThrow("users.manage");
    id = await createUser(actor, userData(fd), str(fd, "password"));
  });
  if (res?.error) return res;
  redirect(`/mitarbeiter/${id}?neu=1`);
}

export async function updateUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("users.manage");
    await updateUser(actor, str(fd, "id"), userData(fd));
    revalidatePath("/mitarbeiter");
    return { success: "Benutzer gespeichert." };
  });
}

export async function setUserStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("users.manage");
    const status = str(fd, "status") === "active" ? "active" : "disabled";
    await setUserStatus(actor, str(fd, "id"), status);
    revalidatePath(`/mitarbeiter/${str(fd, "id")}`);
    return { success: status === "active" ? "Benutzer aktiviert." : "Benutzer deaktiviert." };
  });
}

export async function deleteUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await run(fd, async () => {
    const actor = await actorOrThrow("users.manage");
    await deleteUser(actor, str(fd, "id"));
  });
  if (res?.error) return res;
  redirect("/mitarbeiter");
}

export async function resetPasswordLinkAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("users.manage");
    await adminResetPassword(actor, str(fd, "id"));
    return { success: "Link zum Zurücksetzen wurde versendet." };
  });
}

export async function setPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("users.manage");
    await adminResetPassword(actor, str(fd, "id"), str(fd, "password"));
    return { success: "Neues Passwort gesetzt. Alle Sitzungen des Benutzers wurden beendet." };
  });
}

const brokerData = (fd: FormData) => ({
  name: str(fd, "name"),
  street: str(fd, "street"),
  postalCode: str(fd, "postalCode"),
  city: str(fd, "city"),
  phone: str(fd, "phone"),
  email: str(fd, "email"),
});

export async function createBrokerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await run(fd, async () => {
    const actor = await actorOrThrow("brokers.manage");
    id = await createBroker(actor, brokerData(fd));
  });
  if (res?.error) return res;
  redirect(`/mitarbeiter/broker/${id}`);
}

export async function updateBrokerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("brokers.manage");
    await updateBroker(actor, str(fd, "id"), brokerData(fd));
    return { success: "Brokerfirma gespeichert." };
  });
}

export async function setBrokerActiveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("brokers.manage");
    await setBrokerActive(actor, str(fd, "id"), str(fd, "active") === "true");
    revalidatePath(`/mitarbeiter/broker/${str(fd, "id")}`);
    return { success: "Status geändert." };
  });
}
