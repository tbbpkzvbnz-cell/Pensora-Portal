"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { actorOrThrow } from "@/server/auth/session";
import { run, str } from "@/server/action-utils";
import { changeOwnPassword } from "@/server/services/users";
import { saveSettings, setRolePermission } from "@/server/services/settings";
import { createFoundation, updateFoundation } from "@/server/services/portfolio";
import type { Permission, Role } from "@/server/authz/permissions";

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(null, async () => {
    const actor = await actorOrThrow();
    if (str(fd, "password") !== str(fd, "password2")) return { error: "Die neuen Passwörter stimmen nicht überein." };
    await changeOwnPassword(actor, str(fd, "current"), str(fd, "password"));
    return { success: "Passwort geändert." };
  });
}

export async function togglePermissionAction(fd: FormData) {
  const actor = await actorOrThrow("settings.manage");
  await setRolePermission(actor, str(fd, "role") as Role, str(fd, "permission") as Permission, str(fd, "allowed") === "true");
  revalidatePath("/einstellungen/rollen");
}

export async function saveZentralstelleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("settings.manage");
    await saveSettings(actor, {
      zentralstelle_recipient: str(fd, "zentralstelle_recipient"),
      zentralstelle_subject: str(fd, "zentralstelle_subject"),
      zentralstelle_body: str(fd, "zentralstelle_body"),
      capture_link_hours: str(fd, "capture_link_hours"),
    });
    return { success: "Einstellungen gespeichert." };
  });
}

export async function saveFoundationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("portfolio.edit");
    if (str(fd, "id")) await updateFoundation(actor, str(fd, "id"), str(fd, "name"), str(fd, "address"));
    else await createFoundation(actor, str(fd, "name"), str(fd, "address"));
    revalidatePath("/einstellungen/stiftungen");
    return { success: "Stiftung gespeichert." };
  });
}
