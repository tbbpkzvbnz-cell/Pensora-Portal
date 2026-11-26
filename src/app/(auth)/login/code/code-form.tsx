"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input, btn } from "@/components/ui";
import { resendCodeAction, verifyCodeAction } from "../../actions";

export function CodeForm() {
  const [resendState, resend, resendPending] = useActionState(resendCodeAction, null);
  return (
    <div className="space-y-4">
      <ActionForm action={verifyCodeAction} className="space-y-4">
        {() => (
          <>
            <Field label="Code">
              <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={7} required autoFocus className="text-center text-lg tracking-[0.4em]" />
            </Field>
            <SubmitButton className="w-full" pendingText="Prüfen…">Anmelden</SubmitButton>
          </>
        )}
      </ActionForm>
      <form action={resend} className="flex items-center justify-between text-sm">
        <button type="submit" disabled={resendPending} className={btn.ghost}>Code erneut senden</button>
        <Link href="/login" className="text-muted hover:text-ink">Abbrechen</Link>
      </form>
      {resendState?.success && <p className="text-sm text-emerald-700">{resendState.success}</p>}
      {resendState?.error && <p className="text-sm text-red-700">{resendState.error}</p>}
    </div>
  );
}
