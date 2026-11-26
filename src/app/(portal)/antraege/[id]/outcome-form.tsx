"use client";

import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Select, Textarea } from "@/components/ui";
import { OUTCOME_STATUS_LABELS } from "@/lib/labels";
import { setOutcomeAction } from "../actions";

export function OutcomeForm({ applicationId, current }: { applicationId: string; current: string }) {
  return (
    <ActionForm action={setOutcomeAction} className="space-y-3">
      {() => (
        <>
          <input type="hidden" name="applicationId" value={applicationId} />
          <Field label="Neuer Status">
            <Select name="status" defaultValue={current}>
              {Object.entries(OUTCOME_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Bemerkung (optional)"><Textarea name="note" rows={2} /></Field>
          <div className="flex justify-end"><SubmitButton>Status speichern</SubmitButton></div>
        </>
      )}
    </ActionForm>
  );
}
