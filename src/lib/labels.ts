export const INTAKE_STATUS_LABELS = {
  neu_erfasst: "Neu erfasst",
  unterlagen_unvollstaendig: "Unterlagen unvollständig",
  bereit_zur_antragstellung: "Bereit zur Antragstellung",
  antrag_eingereicht: "Antrag eingereicht",
} as const;

export const REVIEW_STATUS_LABELS = {
  neu_eingegangen: "Neu eingegangen",
  in_pruefung: "In Prüfung",
  unterlagen_unvollstaendig: "Unterlagen unvollständig",
  rueckfrage_erforderlich: "Rückfrage erforderlich",
  bereit_zur_uebermittlung: "Bereit zur Übermittlung",
  uebermittelt: "Übermittelt",
} as const;

export const OUTCOME_STATUS_LABELS = {
  warten_auf_antwort: "Warten auf Antwort",
  rueckmeldung_erhalten: "Rückmeldung erhalten",
  konto_eroeffnet: "Konto eröffnet",
  kontoeroeffnung_nicht_moeglich: "Kontoeröffnung nicht möglich",
} as const;

export const DOCUMENT_TYPE_LABELS = {
  vollmacht_pdf: "Vollmacht (PDF)",
  id_front: "ID-Kopie Vorderseite",
  id_back: "ID-Kopie Rückseite",
  signature: "Unterschrift",
  response: "Antwort Zentralstelle",
  other: "Sonstiges",
} as const;

export const TRANSFER_ORDER_STATUS_LABELS = {
  erteilt: "Erteilt",
  in_bearbeitung: "In Bearbeitung",
  ausgefuehrt: "Ausgeführt",
  storniert: "Storniert",
} as const;

export type IntakeStatus = keyof typeof INTAKE_STATUS_LABELS;
export type ReviewStatus = keyof typeof REVIEW_STATUS_LABELS;
export type OutcomeStatus = keyof typeof OUTCOME_STATUS_LABELS;
export type DocumentType = keyof typeof DOCUMENT_TYPE_LABELS;
