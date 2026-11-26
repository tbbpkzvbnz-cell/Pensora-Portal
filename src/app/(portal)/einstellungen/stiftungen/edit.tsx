"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Input, btn } from "@/components/ui";
import { saveFoundationAction } from "../actions";

export function FoundationEdit({ f }: { f?: { id: string; name: string; address: string | null } }) {
  const [open, setOpen] = useState(!f);
  if (!open) return <div className="text-right"><button className={btn.ghost} onClick={() => setOpen(true)}>Bearbeiten</button></div>;
  return (
    <ActionForm action={async (s, fd) => { const r = await saveFoundationAction(s, fd); if (r?.success && f) setOpen(false); return r; }} resetOnSuccess={!f} className="flex flex-wrap gap-2">
      {() => (
        <>
          {f && <input type="hidden" name="id" value={f.id} />}
          <Input name="name" placeholder="Name der Stiftung" defaultValue={f?.name} required className="min-w-[200px] flex-1" />
          <Input name="address" placeholder="Adresse" defaultValue={f?.address ?? ""} className="min-w-[200px] flex-1" />
          <SubmitButton>{f ? "Speichern" : "Hinzufügen"}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
