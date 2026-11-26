import { formatDateTime } from "@/lib/format";
import { OUTCOME_STATUS_LABELS, REVIEW_STATUS_LABELS } from "@/lib/labels";

type E = { h: { id: string; kind: "review" | "outcome" | "intake"; oldStatus: string | null; newStatus: string; note: string | null; changedAt: Date }; by: string | null };

const label = (kind: string, s: string | null) => {
  if (!s) return "–";
  if (kind === "review") return REVIEW_STATUS_LABELS[s as keyof typeof REVIEW_STATUS_LABELS] ?? s;
  if (kind === "outcome") return OUTCOME_STATUS_LABELS[s as keyof typeof OUTCOME_STATUS_LABELS] ?? s;
  return s === "entwurf" ? "In Erfassung" : s;
};
const KIND = { review: "Prüfung", outcome: "Antragsstatus", intake: "Antrag" };

export function StatusTimeline({ entries }: { entries: E[] }) {
  if (entries.length === 0) return <p className="text-sm text-muted">Keine Einträge.</p>;
  return (
    <ol className="space-y-3 text-sm">
      {entries.map(({ h, by }) => (
        <li key={h.id} className="border-l-2 border-brand-200 pl-3">
          <div><span className="text-muted">{KIND[h.kind]}:</span> {h.oldStatus ? <>{label(h.kind, h.oldStatus)} → </> : null}<strong>{label(h.kind, h.newStatus)}</strong></div>
          {h.note && <div className="text-muted">{h.note}</div>}
          <div className="text-xs text-muted">{formatDateTime(h.changedAt)} · {by ?? "System"}</div>
        </li>
      ))}
    </ol>
  );
}
