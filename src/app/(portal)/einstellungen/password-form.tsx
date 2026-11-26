"use client";

import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { changePasswordAction } from "./actions";

export function PasswordForm() {
  return (
    <ActionForm action={changePasswordAction} resetOnSuccess className="space-y-3">
      {(s) => (
        <>
          <Field label="Aktuelles Passwort" error={s?.fieldErrors?.current}><Input type="password" name="current" autoComplete="current-password" required /></Field>
          <Field label="Neues Passwort" hint="Mind. 12 Zeichen, drei Zeichenarten" error={s?.fieldErrors?.password}><Input type="password" name="password" autoComplete="new-password" required /></Field>
          <Field label="Neues Passwort wiederholen"><Input type="password" name="password2" autoComplete="new-password" required /></Field>
          <div className="flex justify-end"><SubmitButton>Passwort ändern</SubmitButton></div>
        </>
      )}
    </ActionForm>
  );
}
