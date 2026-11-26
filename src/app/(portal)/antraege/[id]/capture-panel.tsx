"use client";

import { useActionState, useState } from "react";
import { Copy, ExternalLink, MessageSquare } from "lucide-react";
import { btn } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { createLinkAction, type LinkState } from "../actions";

export function CaptureLinkPanel({ applicationId, smsActive, phone }: { applicationId: string; smsActive: boolean; phone: string }) {
  const [state, action, pending] = useActionState<LinkState, FormData>(createLinkAction, null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Der Kunde erfasst ID (Vorder- und Rückseite) und Unterschrift selbst auf dem Smartphone. Der Link ist einmalig verwendbar und zeitlich begrenzt.
        Ein neuer Link macht ältere Links ungültig.
      </p>
      <form action={action} className="flex flex-wrap gap-2">
        <input type="hidden" name="applicationId" value={applicationId} />
        <button name="sms" value="1" disabled={pending || !smsActive} className={btn.primary} title={smsActive ? `SMS an ${phone}` : "SMS-Schnittstelle nicht aktiv"}>
          <MessageSquare className="h-4 w-4" /> Link per SMS senden
        </button>
        <button name="sms" value="0" disabled={pending} className={btn.secondary}>Nur Link erstellen</button>
      </form>
      {!smsActive && <p className="text-xs text-amber-800">SMS-Schnittstelle nicht aktiv – der Link kann erstellt und auf diesem Gerät (z.B. Tablet beim Kunden) geöffnet werden.</p>}
      {state?.error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</div>}
      {state?.success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.success}</div>}
      {state?.url && (
        <div className="rounded-lg border border-line bg-surface p-3 text-sm">
          <div className="break-all font-mono text-xs">{state.url}</div>
          <div className="mt-1 text-xs text-muted">Gültig bis {formatDateTime(state.expiresAt)}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={btn.secondary}
              onClick={async () => {
                await navigator.clipboard.writeText(state.url!);
                setCopied(true);
              }}
            >
              <Copy className="h-4 w-4" /> {copied ? "Kopiert" : "Link kopieren"}
            </button>
            <a href={state.url} target="_blank" rel="noopener noreferrer" className={btn.secondary}><ExternalLink className="h-4 w-4" /> Auf diesem Gerät öffnen</a>
          </div>
        </div>
      )}
    </div>
  );
}
