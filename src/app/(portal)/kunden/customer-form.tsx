"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ButtonLink, Field, Input, Select } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";
import { formatAhv, isValidAhv } from "@/lib/ahv";

type C = { id?: string; firstName: string; lastName: string; birthDate: string; ahvNumber: string; street: string; postalCode: string; city: string; phone: string; email: string };

export function CustomerForm({
  action,
  customer,
  advisors,
  cancelHref,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  customer?: C;
  advisors?: { id: string; name: string }[];
  cancelHref: string;
}) {
  const [ahv, setAhv] = useState(customer ? formatAhv(customer.ahvNumber) : "756.");
  const ahvOk = isValidAhv(ahv);
  return (
    <ActionForm action={action} className="space-y-6">
      {(s) => {
        const v = (k: keyof C) => s?.values?.[k] ?? customer?.[k] ?? "";
        const fe = s?.fieldErrors ?? {};
        return (
          <>
            {customer?.id && <input type="hidden" name="id" value={customer.id} />}
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Person</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Vorname" required error={fe.firstName}><Input name="firstName" defaultValue={v("firstName")} required autoComplete="off" /></Field>
                <Field label="Nachname" required error={fe.lastName}><Input name="lastName" defaultValue={v("lastName")} required autoComplete="off" /></Field>
                <Field label="Geburtsdatum" required error={fe.birthDate}><Input name="birthDate" type="date" defaultValue={v("birthDate")} required /></Field>
                <Field label="AHV-Nummer" required error={fe.ahvNumber} hint={ahv.replace(/\D/g, "").length === 13 ? (ahvOk ? "✓ Formal gültig" : "Prüfziffer ungültig") : "Format 756.XXXX.XXXX.XX"}>
                  <Input
                    name="ahvNumber"
                    value={ahv}
                    onChange={(e) => {
                      const d = e.target.value.replace(/\D/g, "").slice(0, 13);
                      setAhv(d.length >= 3 ? [d.slice(0, 3), d.slice(3, 7), d.slice(7, 11), d.slice(11)].filter(Boolean).join(".") : d);
                    }}
                    inputMode="numeric"
                    required
                    aria-invalid={ahv.replace(/\D/g, "").length === 13 && !ahvOk}
                  />
                </Field>
              </div>
            </section>
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Adresse</h3>
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="sm:col-span-4"><Field label="Strasse und Hausnummer" required error={fe.street}><Input name="street" defaultValue={v("street")} required /></Field></div>
                <Field label="PLZ" required error={fe.postalCode}><Input name="postalCode" defaultValue={v("postalCode")} inputMode="numeric" required /></Field>
                <div className="sm:col-span-3"><Field label="Wohnort" required error={fe.city}><Input name="city" defaultValue={v("city")} required /></Field></div>
              </div>
            </section>
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Kontakt</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Telefonnummer (Mobile für SMS-Link)" required error={fe.phone}><Input name="phone" type="tel" defaultValue={v("phone")} required /></Field>
                <Field label="E-Mail-Adresse" required error={fe.email}><Input name="email" type="email" defaultValue={v("email")} required /></Field>
              </div>
            </section>
            {advisors && (
              <section>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Zuordnung</h3>
                <Field label="Berater" required error={fe.advisorId} hint="Die Brokerfirma wird automatisch vom Berater übernommen.">
                  <Select name="advisorId" defaultValue={s?.values?.advisorId ?? ""}>
                    <option value="">Bitte wählen…</option>
                    {advisors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </Select>
                </Field>
              </section>
            )}
            <div className="flex justify-end gap-2">
              <ButtonLink variant="secondary" href={cancelHref}>Abbrechen</ButtonLink>
              <SubmitButton>{customer?.id ? "Speichern" : "Kunde erfassen"}</SubmitButton>
            </div>
          </>
        );
      }}
    </ActionForm>
  );
}
