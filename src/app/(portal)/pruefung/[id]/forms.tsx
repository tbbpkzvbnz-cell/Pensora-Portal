"use client";

import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { REVIEW_STATUS_LABELS, type ReviewStatus } from "@/lib/labels";
import { setReviewStatusAction, transmitAction } from "../actions";

export function ReviewStatusForm({ applicationId, current, statuses }: { applicationId: string; current: string; statuses: ReviewStatus[] }) {
  return (
    <ActionForm action={setReviewStatusAction} className="space-y-3">
      {(s) => (
        <>
          <input type="hidden" name="applicationId" value={applicationId} />
          <Field label="Status">
            <Select name="status" defaultValue={s?.values?.status ?? current}>
              {statuses.map((st) => <option key={st} value={st}>{REVIEW_STATUS_LABELS[st]}</option>)}
            </Select>
          </Field>
          <Field label="Interne Notiz" hint="Pflicht bei „Unterlagen unvollständig“ und „Rückfrage erforderlich“ – der Berater wird benachrichtigt." error={s?.fieldErrors?.note}>
            <Textarea name="note" rows={3} defaultValue={s?.error ? s?.values?.note : ""} />
          </Field>
          <div className="flex justify-end"><SubmitButton>Status speichern</SubmitButton></div>
        </>
      )}
    </ActionForm>
  );
}

export function TransmitForm({ applicationId, draft, enabled }: { applicationId: string; draft: { recipient: string; subject: string; body: string }; enabled: boolean }) {
  return (
    <ActionForm action={transmitAction} className="space-y-3">
      {(s) => (
        <fieldset disabled={!enabled} className="space-y-3 disabled:opacity-60">
          <input type="hidden" name="applicationId" value={applicationId} />
          <Field label="Empfänger" error={s?.fieldErrors?.recipient} hint="Standard unter Einstellungen → Zentralstelle"><Input name="recipient" type="email" defaultValue={s?.values?.recipient ?? draft.recipient} required /></Field>
          <Field label="Betreff" error={s?.fieldErrors?.subject}><Input name="subject" defaultValue={s?.values?.subject ?? draft.subject} required /></Field>
          <Field label="Text" error={s?.fieldErrors?.body}><Textarea name="body" rows={9} defaultValue={s?.values?.body ?? draft.body} required /></Field>
          <p className="text-xs text-muted">Anhang: vollständiges Antrags-PDF (Vollmacht inkl. Unterschrift und ID-Kopie).</p>
          <div className="flex justify-end"><SubmitButton pendingText="Wird gesendet…">E-Mail senden</SubmitButton></div>
        </fieldset>
      )}
    </ActionForm>
  );
}
