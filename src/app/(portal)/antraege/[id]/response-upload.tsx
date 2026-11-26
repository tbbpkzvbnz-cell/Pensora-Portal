"use client";

import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { todayZurich } from "@/lib/format";
import { uploadResponseAction } from "../actions";

export function ResponseUpload({ applicationId, customerLabel }: { applicationId: string; customerLabel: string }) {
  return (
    <ActionForm action={uploadResponseAction} resetOnSuccess className="space-y-3">
      {(s) => (
        <>
          <input type="hidden" name="applicationId" value={applicationId} />
          <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm">Zuordnung zu: <strong>{customerLabel}</strong></div>
          <Field label="Gescanntes Antwortdokument (PDF)" error={s?.fieldErrors?.file}><Input type="file" name="file" accept="application/pdf" required /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Eingangsdatum" error={s?.fieldErrors?.receivedOn}><Input type="date" name="receivedOn" defaultValue={todayZurich()} required /></Field>
            <Field label="Kontrolle: letzte 4 Ziffern AHV-Nr. laut Dokument" error={s?.fieldErrors?.confirmAhvLast4}><Input name="ahvLast4" inputMode="numeric" maxLength={4} required /></Field>
          </div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmed" className="mt-1 accent-brand-600" required /> Ich habe geprüft, dass das Dokument zu diesem Kunden gehört.</label>
          {s?.fieldErrors?.confirmed && <p className="text-xs text-red-600">{s.fieldErrors.confirmed}</p>}
          <div className="flex justify-end"><SubmitButton pendingText="Hochladen…">Antwortdokument speichern</SubmitButton></div>
        </>
      )}
    </ActionForm>
  );
}
