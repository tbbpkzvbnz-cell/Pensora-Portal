import { Badge, type Tone } from "./ui";
import { INTAKE_STATUS_LABELS, OUTCOME_STATUS_LABELS, REVIEW_STATUS_LABELS, type IntakeStatus, type OutcomeStatus, type ReviewStatus } from "@/lib/labels";

const INTAKE_TONE: Record<IntakeStatus, Tone> = { neu_erfasst: "blue", unterlagen_unvollstaendig: "amber", bereit_zur_antragstellung: "violet", antrag_eingereicht: "green" };
const REVIEW_TONE: Record<ReviewStatus, Tone> = {
  neu_eingegangen: "blue",
  in_pruefung: "violet",
  unterlagen_unvollstaendig: "amber",
  rueckfrage_erforderlich: "amber",
  bereit_zur_uebermittlung: "violet",
  uebermittelt: "green",
};
const OUTCOME_TONE: Record<OutcomeStatus, Tone> = { warten_auf_antwort: "blue", rueckmeldung_erhalten: "violet", konto_eroeffnet: "green", kontoeroeffnung_nicht_moeglich: "red" };

export const IntakeBadge = ({ s }: { s: IntakeStatus }) => <Badge tone={INTAKE_TONE[s]}>{INTAKE_STATUS_LABELS[s]}</Badge>;
export const ReviewBadge = ({ s }: { s: ReviewStatus | null }) => (s ? <Badge tone={REVIEW_TONE[s]}>{REVIEW_STATUS_LABELS[s]}</Badge> : <span className="text-muted">–</span>);
export const OutcomeBadge = ({ s }: { s: OutcomeStatus | null }) => (s ? <Badge tone={OUTCOME_TONE[s]}>{OUTCOME_STATUS_LABELS[s]}</Badge> : <span className="text-muted">–</span>);

/** Combined status of the latest application as shown in customer lists. */
export function ApplicationStatus({ review, outcome, phase }: { review: string | null; outcome: string | null; phase?: string | null }) {
  if (outcome) return <OutcomeBadge s={outcome as OutcomeStatus} />;
  if (review) return <ReviewBadge s={review as ReviewStatus} />;
  if (phase === "entwurf") return <Badge tone="gray">In Erfassung</Badge>;
  return <span className="text-muted">–</span>;
}

export function DocsIndicator({ front, back, sig }: { front: boolean; back: boolean; sig: boolean }) {
  const n = [front, back, sig].filter(Boolean).length;
  const tone: Tone = n === 3 ? "green" : n === 0 ? "gray" : "amber";
  return (
    <span title={`ID vorne: ${front ? "✓" : "–"} · ID hinten: ${back ? "✓" : "–"} · Unterschrift: ${sig ? "✓" : "–"}`}>
      <Badge tone={tone}>{n === 3 ? "Vollständig" : `${n}/3`}</Badge>
    </span>
  );
}
