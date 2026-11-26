"use client";

import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input, Select } from "@/components/ui";
import { uploadDocumentAction } from "../actions";

export function DocumentUpload({ customerId }: { customerId: string }) {
  return (
    <ActionForm action={uploadDocumentAction} resetOnSuccess className="grid items-end gap-4 sm:grid-cols-[200px_1fr_auto]">
      {() => (
        <>
          <input type="hidden" name="customerId" value={customerId} />
          <Field label="Dokumenttyp">
            <Select name="type" defaultValue="id_front">
              <option value="id_front">ID-Kopie Vorderseite</option>
              <option value="id_back">ID-Kopie Rückseite</option>
              <option value="other">Sonstiges</option>
            </Select>
          </Field>
          <Field label="Datei" hint="JPG, PNG oder PDF, max. 10 MB. Die Unterschrift erfasst der Kunde über den Erfassungslink.">
            <Input name="file" type="file" accept="image/jpeg,image/png,application/pdf" required />
          </Field>
          <SubmitButton pendingText="Hochladen…">Hochladen</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
