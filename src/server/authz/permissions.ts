/**
 * Central permission catalogue. Default grants follow docs/phase-1-konzept.md §3.
 * Values can be overridden per role in table `role_permissions` (Settings → Rollen & Berechtigungen).
 * This file has no server-only imports so the UI can use the labels.
 */

export const ROLES = [
  "pensora_gl",
  "pensora_backoffice",
  "pensora_closer",
  "broker_gl",
  "broker_advisor",
  "pensora_advisor",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  pensora_gl: "Pensora GL",
  pensora_backoffice: "Pensora Backoffice",
  pensora_closer: "Pensora Closer",
  broker_gl: "Externe Broker GL",
  broker_advisor: "Externe Broker Berater",
  pensora_advisor: "Pensora Berater",
};

export const BROKER_ROLES: Role[] = ["broker_gl", "broker_advisor"];
export const ADVISOR_ROLES: Role[] = ["broker_advisor", "pensora_advisor"];
export const PENSORA_ROLES: Role[] = ["pensora_gl", "pensora_backoffice", "pensora_closer", "pensora_advisor"];

/** Roles that cannot log in yet (prepared, activatable later). */
export const ROLE_ENABLED_DEFAULT: Record<Role, boolean> = {
  pensora_gl: true,
  pensora_backoffice: true,
  pensora_closer: false,
  broker_gl: true,
  broker_advisor: true,
  pensora_advisor: true,
};

export const PERMISSIONS = {
  "role.login": "Anmeldung möglich (Rolle aktiv)",
  "dashboard.view": "Dashboard ansehen",
  "customers.view": "Kunden ansehen (im Datenbereich)",
  "customers.create": "Kunden erfassen",
  "customers.edit": "Kundendaten bearbeiten",
  "customers.edit_after_submission": "Kundendaten nach Übergabe an Pensora bearbeiten",
  "customers.reassign": "Kunden einem anderen Berater zuweisen",
  "applications.view": "Anträge ansehen (im Datenbereich)",
  "applications.create": "Freizügigkeitsanfrage auslösen / Erfassungslink senden",
  "review.access": "Überprüfungen & Übermittlungen",
  "review.change_status": "Prüfstatus ändern",
  "review.transmit": "An Zentralstelle übermitteln",
  "responses.upload": "Antwortdokumente hochladen",
  "applications.change_outcome": "Antragsstatus (Ergebnis) ändern",
  "portfolio.view": "Portfolio ansehen (im Datenbereich)",
  "portfolio.edit": "Portfolio bearbeiten",
  "notes.create": "Interne Notizen erfassen",
  "notes.view_internal": "Pensora-interne Notizen sehen",
  "users.manage": "Benutzer verwalten",
  "users.view_own_firm": "Eigene Mitarbeiter ansehen",
  "brokers.manage": "Brokerfirmen verwalten",
  "export.data": "Export CSV/Excel",
  "settings.manage": "Einstellungen, Integrationen und Rollenrechte",
  "audit.view": "Protokoll einsehen",
} as const;
export type Permission = keyof typeof PERMISSIONS;

const all = Object.keys(PERMISSIONS) as Permission[];

export const DEFAULT_GRANTS: Record<Role, Permission[]> = {
  pensora_gl: all.filter((p) => p !== "users.view_own_firm"),
  pensora_backoffice: [
    "role.login",
    "dashboard.view",
    "customers.view",
    "applications.view",
    "review.access",
    "review.change_status",
    "review.transmit",
    "responses.upload",
    "notes.create",
    "notes.view_internal",
  ],
  pensora_closer: [],
  broker_gl: ["role.login", "dashboard.view", "customers.view", "applications.view", "portfolio.view", "users.view_own_firm"],
  broker_advisor: [
    "role.login",
    "dashboard.view",
    "customers.view",
    "customers.create",
    "customers.edit",
    "applications.view",
    "applications.create",
    "portfolio.view",
    "notes.create",
  ],
  pensora_advisor: [
    "role.login",
    "dashboard.view",
    "customers.view",
    "customers.create",
    "customers.edit",
    "applications.view",
    "applications.create",
    "portfolio.view",
    "notes.create",
    "notes.view_internal",
  ],
};

/** Permissions that must never be removed from Pensora GL (prevents lock-out). */
export const LOCKED_GL_PERMISSIONS: Permission[] = ["role.login", "users.manage", "settings.manage"];

/** Customer data scope per role (§3.1). Not configurable on purpose. */
export type ScopeKind = "all" | "submitted" | "firm" | "own" | "none";
export const ROLE_SCOPE: Record<Role, ScopeKind> = {
  pensora_gl: "all",
  pensora_backoffice: "submitted",
  pensora_closer: "none",
  broker_gl: "firm",
  broker_advisor: "own",
  pensora_advisor: "own",
};
