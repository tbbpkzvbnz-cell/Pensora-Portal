"use client";

import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";

type B = { id?: string; name: string; street: string | null; postalCode: string | null; city: string | null; phone: string | null; email: string | null };

export function BrokerForm({ action, broker, readOnly }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; broker?: B; readOnly?: boolean }) {
  return (
    <ActionForm action={action} className="space-y-4">
      {(s) => {
        const v = (k: keyof B) => s?.values?.[k] ?? broker?.[k] ?? "";
        const fe = s?.fieldErrors ?? {};
        return (
          <fieldset disabled={readOnly} className="space-y-4">
            {broker?.id && <input type="hidden" name="id" value={broker.id} />}
            <Field label="Firmenname" required error={fe.name}><Input name="name" defaultValue={v("name")} required /></Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Strasse / Nr." error={fe.street}><Input name="street" defaultValue={v("street")} /></Field>
              <Field label="PLZ" error={fe.postalCode}><Input name="postalCode" defaultValue={v("postalCode")} /></Field>
              <Field label="Ort" error={fe.city}><Input name="city" defaultValue={v("city")} /></Field>
              <Field label="Telefon" error={fe.phone}><Input name="phone" defaultValue={v("phone")} /></Field>
              <Field label="E-Mail" error={fe.email}><Input name="email" type="email" defaultValue={v("email")} /></Field>
            </div>
            {!readOnly && <div className="flex justify-end"><SubmitButton>{broker?.id ? "Speichern" : "Brokerfirma erstellen"}</SubmitButton></div>}
          </fieldset>
        );
      }}
    </ActionForm>
  );
}
