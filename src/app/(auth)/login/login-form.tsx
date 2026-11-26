"use client";

import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { loginAction } from "../actions";

export function LoginForm() {
  return (
    <ActionForm action={loginAction} className="space-y-4">
      {(s) => (
        <>
          <Field label="E-Mail oder Telefonnummer">
            <Input name="identifier" autoComplete="username" required defaultValue={s?.values?.identifier} autoFocus />
          </Field>
          <Field label="Passwort">
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <SubmitButton className="w-full" pendingText="Anmelden…">Weiter</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
