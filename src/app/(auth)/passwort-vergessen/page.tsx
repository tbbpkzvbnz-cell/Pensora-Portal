"use client";

import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { requestResetAction } from "../actions";

export default function ForgotPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Passwort vergessen</h1>
      <p className="mt-1 text-sm text-muted">Sie erhalten einen Link zum Zurücksetzen per E-Mail (oder SMS, falls E-Mail nicht aktiv ist).</p>
      <ActionForm action={requestResetAction} className="mt-6 space-y-4">
        {() => (
          <>
            <Field label="E-Mail oder Telefonnummer"><Input name="identifier" required autoFocus /></Field>
            <SubmitButton className="w-full" pendingText="Senden…">Link anfordern</SubmitButton>
          </>
        )}
      </ActionForm>
      <div className="mt-6 text-center text-sm"><Link href="/login" className="text-brand-600 hover:underline">Zurück zur Anmeldung</Link></div>
    </>
  );
}
