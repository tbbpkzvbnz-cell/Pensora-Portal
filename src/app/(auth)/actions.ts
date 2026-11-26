"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { requestPasswordReset, resendLoginCode, resetPassword, startLogin, verifyLoginCode } from "@/server/auth/login";
import { destroyCurrentSession } from "@/server/auth/session";

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z.object({ identifier: z.string().trim().min(3).max(200), password: z.string().min(1).max(200) }).safeParse({
    identifier: fd.get("identifier"),
    password: fd.get("password"),
  });
  if (!parsed.success) return { error: "Bitte E-Mail-Adresse oder Telefonnummer und Passwort eingeben.", values: { identifier: String(fd.get("identifier") ?? "") } };
  const res = await startLogin(parsed.data.identifier, parsed.data.password);
  if (!res.ok) return { error: res.error, values: { identifier: parsed.data.identifier } };
  redirect("/login/code");
}

export async function verifyCodeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const code = String(fd.get("code") ?? "");
  if (!/^\d{6}$/.test(code.replace(/\s/g, ""))) return { error: "Bitte den 6-stelligen Code eingeben." };
  const res = await verifyLoginCode(code);
  if (!res.ok) return { error: res.error };
  redirect("/dashboard");
}

export async function resendCodeAction(): Promise<ActionState> {
  const res = await resendLoginCode();
  return res.ok ? { success: "Ein neuer Code wurde gesendet." } : { error: res.error };
}

export async function logoutAction() {
  await destroyCurrentSession();
  redirect("/login");
}

export async function requestResetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const identifier = String(fd.get("identifier") ?? "").trim();
  if (identifier.length < 3) return { error: "Bitte E-Mail-Adresse oder Telefonnummer eingeben." };
  try {
    await requestPasswordReset(identifier);
  } catch (e) {
    console.error("password reset delivery failed", e);
  }
  return { success: "Falls ein aktives Konto existiert, wurde ein Link zum Zurücksetzen versendet." };
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const token = String(fd.get("token") ?? "");
  const pw = String(fd.get("password") ?? "");
  if (pw !== String(fd.get("password2") ?? "")) return { error: "Die Passwörter stimmen nicht überein." };
  const res = await resetPassword(token, pw);
  if (!res.ok) return { error: res.error };
  return { success: "Ihr Passwort wurde geändert. Sie können sich jetzt anmelden." };
}
