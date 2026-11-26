"use client";

import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { resetPasswordAction } from "../../actions";

export function ResetForm({ token }: { token: string }) {
  return (
    <ActionForm action={resetPasswordAction} className="mt-6 space-y-4">
      {(s) =>
        s?.success ? (
          <Link href="/login" className="text-brand-600 underline">Zur Anmeldung</Link>
        ) : (
          <>
            <input type="hidden" name="token" value={token} />
            <Field label="Neues Passwort" hint="Mind. 12 Zeichen, drei von: Klein-, Grossbuchstaben, Ziffern, Sonderzeichen">
              <Input name="password" type="password" autoComplete="new-password" required />
            </Field>
            <Field label="Passwort wiederholen"><Input name="password2" type="password" autoComplete="new-password" required /></Field>
            <SubmitButton className="w-full">Passwort speichern</SubmitButton>
          </>
        )
      }
    </ActionForm>
  );
}
