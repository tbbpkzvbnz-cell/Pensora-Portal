"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "./forms";
import { Badge, Textarea, btn } from "./ui";
import { formatDateTime } from "@/lib/format";
import { addNoteAction, editNoteAction } from "@/app/(portal)/kunden/actions";

type Note = {
  note: { id: string; body: string; createdAt: Date; editedAt: Date | null; internalOnly: boolean; authorId: string };
  authorFirst: string;
  authorLast: string;
  revisions: { rev: { id: string; previousBody: string; editedAt: Date }; editorFirst: string; editorLast: string }[];
};

const QUICK = ["Kunde angerufen.", "Kunde nicht erreicht.", "Kunde möchte später kontaktiert werden.", "Rückfrage bei Stiftung.", "Überweisungsauftrag erteilt.", "Geldeingang bestätigt."];

export function NotesPanel({ customerId, notes, canCreate, canInternal, actorId }: { customerId: string; notes: Note[]; canCreate: boolean; canInternal: boolean; actorId: string }) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="space-y-5">
      {canCreate && (
        <ActionForm action={async (s, fd) => { const r = await addNoteAction(s, fd); if (r?.success) setText(""); return r; }} className="space-y-3">
          {(s) => (
            <>
              <input type="hidden" name="customerId" value={customerId} />
              <div className="flex flex-wrap gap-1.5">
                {QUICK.map((q) => (
                  <button key={q} type="button" onClick={() => setText((t) => (t ? t + " " : "") + q)} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:border-brand-300 hover:text-brand-700">{q}</button>
                ))}
              </div>
              <Textarea name="body" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Notiz erfassen…" aria-invalid={!!s?.fieldErrors?.body} />
              <div className="flex items-center justify-between gap-3">
                {canInternal ? (
                  <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" name="internalOnly" className="accent-brand-600" /> Nur intern (Pensora)</label>
                ) : <span />}
                <SubmitButton>Notiz speichern</SubmitButton>
              </div>
            </>
          )}
        </ActionForm>
      )}
      <ol className="space-y-3">
        {notes.length === 0 && <li className="text-sm text-muted">Noch keine Notizen.</li>}
        {notes.map((n) => (
          <li key={n.note.id} className="rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="font-medium text-ink">{n.authorFirst} {n.authorLast}</span>
              <span>{formatDateTime(n.note.createdAt)}</span>
              {n.note.internalOnly && <Badge tone="violet">Intern</Badge>}
              {n.note.editedAt && <Badge>bearbeitet {formatDateTime(n.note.editedAt)}</Badge>}
              {n.note.authorId === actorId && editing !== n.note.id && (
                <button className="ml-auto text-brand-700 hover:underline" onClick={() => setEditing(n.note.id)}>Bearbeiten</button>
              )}
            </div>
            {editing === n.note.id ? (
              <ActionForm action={async (s, fd) => { const r = await editNoteAction(s, fd); if (r?.success) setEditing(null); return r; }} className="mt-2 space-y-2">
                {() => (
                  <>
                    <input type="hidden" name="noteId" value={n.note.id} />
                    <input type="hidden" name="customerId" value={customerId} />
                    <Textarea name="body" rows={3} defaultValue={n.note.body} />
                    <p className="text-xs text-muted">Die bisherige Fassung bleibt in der Versionshistorie sichtbar.</p>
                    <div className="flex justify-end gap-2">
                      <button type="button" className={btn.secondary} onClick={() => setEditing(null)}>Abbrechen</button>
                      <SubmitButton>Speichern</SubmitButton>
                    </div>
                  </>
                )}
              </ActionForm>
            ) : (
              <p className="mt-1 whitespace-pre-wrap text-sm">{n.note.body}</p>
            )}
            {n.revisions.length > 0 && (
              <details className="mt-2 text-xs text-muted">
                <summary className="cursor-pointer">Frühere Fassungen ({n.revisions.length})</summary>
                <ul className="mt-2 space-y-2">
                  {n.revisions.map((r) => (
                    <li key={r.rev.id} className="rounded bg-surface p-2">
                      <div>bis {formatDateTime(r.rev.editedAt)} · geändert von {r.editorFirst} {r.editorLast}</div>
                      <div className="mt-1 whitespace-pre-wrap text-ink">{r.rev.previousBody}</div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
