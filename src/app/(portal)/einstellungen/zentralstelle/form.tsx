"use client";

import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input, Textarea } from "@/components/ui";
import { saveZentralstelleAction } from "../actions";

export function ZentralstelleForm({ values }: { values: Record<string, string> }) {
  return (
    <ActionForm action={saveZentralstelleAction} className="space-y-4">
      {(s) => {
        const v = (k: string) => s?.values?.[k] ?? values[k];
        const fe = s?.fieldErrors ?? {};
        return (
          <>
            <Field label="Empfänger (E-Mail der Zentralstelle)" error={fe.zentralstelle_recipient} hint="Wird beim Versand vorausgefüllt und kann pro Antrag angepasst werden."><Input name="zentralstelle_recipient" type="email" defaultValue={v("zentralstelle_recipient")} /></Field>
            <Field label="Betreff-Vorlage" error={fe.zentralstelle_subject} hint="Platzhalter: {nachname} {vorname} {geburtsdatum} {ahv}"><Input name="zentralstelle_subject" defaultValue={v("zentralstelle_subject")} /></Field>
            <Field label="Text-Vorlage" error={fe.zentralstelle_body}><Textarea name="zentralstelle_body" rows={12} defaultValue={v("zentralstelle_body")} /></Field>
            <Field label="Gültigkeit Erfassungslink (Stunden)" error={fe.capture_link_hours}><Input name="capture_link_hours" type="number" min={1} max={720} defaultValue={v("capture_link_hours")} className="max-w-[160px]" /></Field>
            <div className="flex justify-end"><SubmitButton>Speichern</SubmitButton></div>
          </>
        );
      }}
    </ActionForm>
  );
}
