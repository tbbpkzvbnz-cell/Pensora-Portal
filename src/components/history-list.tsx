import { formatDateTime } from "@/lib/format";

type Entry = { id: string; summary: string; actorLabel: string | null; createdAt: Date; changes: Record<string, { from: unknown; to: unknown }> | null };

const FIELD: Record<string, string> = {
  firstName: "Vorname", lastName: "Nachname", birthDate: "Geburtsdatum", ahvNumber: "AHV-Nr.", street: "Strasse", postalCode: "PLZ", city: "Ort", phone: "Telefon", email: "E-Mail",
  advisorId: "Berater", brokerFirmId: "Brokerfirma", amount: "Betrag", receivedOn: "Eingangsdatum", orderDate: "Auftragsdatum", remark: "Bemerkung", status: "Status", foundationId: "Stiftung",
  orderAmount: "Auftragsbetrag", receivedAmount: "Eingegangener Betrag", accountOpenedOn: "Konto eröffnet am",
};

export function HistoryList({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) return <p className="text-sm text-muted">Noch keine Aktivitäten.</p>;
  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {entries.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-300 ring-4 ring-white" />
          <div className="text-sm">{e.summary}</div>
          <div className="text-xs text-muted">{formatDateTime(e.createdAt)} · {e.actorLabel ?? "System"}</div>
          {e.changes && Object.keys(e.changes).length > 0 && !("advisorId" in e.changes) && (
            <ul className="mt-1 space-y-0.5 text-xs text-muted">
              {Object.entries(e.changes).map(([k, v]) => (
                <li key={k}>{FIELD[k] ?? k}: <span className="line-through">{String(v.from ?? "–")}</span> → <span className="text-ink">{String(v.to ?? "–")}</span></li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
