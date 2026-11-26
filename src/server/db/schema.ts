import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const chf = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "string" });

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const roleEnum = pgEnum("user_role", [
  "pensora_gl",
  "pensora_backoffice",
  "pensora_closer",
  "broker_gl",
  "broker_advisor",
  "pensora_advisor",
]);

export const userStatusEnum = pgEnum("user_status", ["active", "disabled"]);

export const intakeStatusEnum = pgEnum("customer_intake_status", [
  "neu_erfasst",
  "unterlagen_unvollstaendig",
  "bereit_zur_antragstellung",
  "antrag_eingereicht",
]);

export const applicationPhaseEnum = pgEnum("application_phase", [
  "entwurf", // created by advisor, capture pending
  "eingereicht", // handed over to Pensora (official search timestamp set)
]);

export const reviewStatusEnum = pgEnum("review_status", [
  "neu_eingegangen",
  "in_pruefung",
  "unterlagen_unvollstaendig",
  "rueckfrage_erforderlich",
  "bereit_zur_uebermittlung",
  "uebermittelt",
]);

export const outcomeStatusEnum = pgEnum("outcome_status", [
  "warten_auf_antwort",
  "rueckmeldung_erhalten",
  "konto_eroeffnet",
  "kontoeroeffnung_nicht_moeglich",
]);

export const statusKindEnum = pgEnum("status_kind", ["review", "outcome", "intake"]);

export const documentTypeEnum = pgEnum("document_type", [
  "vollmacht_pdf",
  "id_front",
  "id_back",
  "signature",
  "response",
  "other",
]);

export const captureLinkStatusEnum = pgEnum("capture_link_status", [
  "active",
  "completed",
  "revoked",
  "expired",
]);

export const submissionStatusEnum = pgEnum("submission_status", ["pending", "sent", "failed"]);

export const otpPurposeEnum = pgEnum("otp_purpose", ["login"]);

export const transferOrderStatusEnum = pgEnum("transfer_order_status", [
  "erteilt",
  "in_bearbeitung",
  "ausgefuehrt",
  "storniert",
]);

export const transactionKindEnum = pgEnum("transaction_kind", ["eingang", "korrektur"]);

/* ------------------------------------------------------------------ */
/* Users, roles, sessions                                              */
/* ------------------------------------------------------------------ */

export const brokerFirms = pgTable("broker_firms", {
  id: id(),
  name: text("name").notNull(),
  street: text("street"),
  postalCode: text("postal_code"),
  city: text("city"),
  phone: text("phone"),
  email: text("email"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("broker_firms_name_uq").on(sql`lower(${t.name})`)]);

export const users = pgTable("users", {
  id: id(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(), // E.164
  role: roleEnum("role").notNull(),
  brokerFirmId: uuid("broker_firm_id").references(() => brokerFirms.id),
  passwordHash: text("password_hash").notNull(),
  status: userStatusEnum("status").notNull().default("active"),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: ts("locked_until"),
  lastLoginAt: ts("last_login_at"),
  passwordChangedAt: ts("password_changed_at"),
  deletedAt: ts("deleted_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("users_email_uq").on(sql`lower(${t.email})`),
  uniqueIndex("users_phone_uq").on(t.phone),
  index("users_broker_idx").on(t.brokerFirmId),
]);

export const rolePermissions = pgTable("role_permissions", {
  role: roleEnum("role").notNull(),
  permission: text("permission").notNull(),
  allowed: boolean("allowed").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("role_permissions_pk").on(t.role, t.permission)]);

export const sessions = pgTable("sessions", {
  id: id(),
  tokenHash: text("token_hash").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** true only after the second factor was verified */
  verified: boolean("verified").notNull().default(false),
  lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  expiresAt: ts("expires_at").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("sessions_token_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId)]);

export const otpChallenges = pgTable("otp_challenges", {
  id: id(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  purpose: otpPurposeEnum("purpose").notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: ts("expires_at").notNull(),
  consumedAt: ts("consumed_at"),
  createdAt: createdAt(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("pw_reset_token_uq").on(t.tokenHash)]);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: ts("window_start").notNull(),
});

/* ------------------------------------------------------------------ */
/* Customers and applications                                          */
/* ------------------------------------------------------------------ */

export const customers = pgTable("customers", {
  id: id(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  birthDate: date("birth_date", { mode: "string" }).notNull(),
  ahvNumber: text("ahv_number").notNull(), // normalized 13 digits
  street: text("street").notNull(),
  postalCode: text("postal_code").notNull(),
  city: text("city").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  advisorId: uuid("advisor_id").notNull().references(() => users.id),
  brokerFirmId: uuid("broker_firm_id").references(() => brokerFirms.id),
  intakeStatus: intakeStatusEnum("intake_status").notNull().default("neu_erfasst"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: ts("deleted_at"),
}, (t) => [
  uniqueIndex("customers_ahv_uq").on(t.ahvNumber),
  index("customers_advisor_idx").on(t.advisorId),
  index("customers_broker_idx").on(t.brokerFirmId),
  index("customers_name_idx").on(sql`lower(${t.lastName})`, sql`lower(${t.firstName})`),
  index("customers_created_idx").on(t.createdAt),
]);

export const applications = pgTable("applications", {
  id: id(),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  advisorId: uuid("advisor_id").notNull().references(() => users.id),
  brokerFirmId: uuid("broker_firm_id").references(() => brokerFirms.id),
  phase: applicationPhaseEnum("phase").notNull().default("entwurf"),
  /** Snapshot of the data printed on the authority form */
  formData: jsonb("form_data").$type<FormSnapshot>().notNull(),
  applicationDate: date("application_date", { mode: "string" }).notNull(),
  submittedToPensoraAt: ts("submitted_to_pensora_at"),
  reviewStatus: reviewStatusEnum("review_status"),
  outcomeStatus: outcomeStatusEnum("outcome_status"),
  transmittedAt: ts("transmitted_at"),
  pdfDocumentId: uuid("pdf_document_id"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("applications_customer_idx").on(t.customerId),
  index("applications_review_idx").on(t.reviewStatus),
  index("applications_outcome_idx").on(t.outcomeStatus),
  index("applications_submitted_idx").on(t.submittedToPensoraAt),
]);

export type FormSnapshot = {
  lastName: string;
  firstName: string;
  birthDate: string;
  ahvNumber: string;
  street: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
};

export const documents = pgTable("documents", {
  id: id(),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  applicationId: uuid("application_id").references(() => applications.id),
  type: documentTypeEnum("type").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  storageKey: text("storage_key").notNull(),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  uploadedViaLinkId: uuid("uploaded_via_link_id"),
  receivedOn: date("received_on", { mode: "string" }),
  supersededAt: ts("superseded_at"),
  createdAt: createdAt(),
  deletedAt: ts("deleted_at"),
}, (t) => [
  index("documents_customer_idx").on(t.customerId),
  index("documents_application_idx").on(t.applicationId),
]);

export const captureLinks = pgTable("capture_links", {
  id: id(),
  applicationId: uuid("application_id").notNull().references(() => applications.id),
  tokenHash: text("token_hash").notNull(),
  status: captureLinkStatusEnum("status").notNull().default("active"),
  sentTo: text("sent_to"),
  smsSentAt: ts("sms_sent_at"),
  smsError: text("sms_error"),
  maxUses: integer("max_uses").notNull().default(1),
  uses: integer("uses").notNull().default(0),
  expiresAt: ts("expires_at").notNull(),
  completedAt: ts("completed_at"),
  revokedAt: ts("revoked_at"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("capture_links_token_uq").on(t.tokenHash), index("capture_links_app_idx").on(t.applicationId)]);

export const applicationStatusHistory = pgTable("application_status_history", {
  id: id(),
  applicationId: uuid("application_id").notNull().references(() => applications.id),
  kind: statusKindEnum("kind").notNull(),
  oldStatus: text("old_status"),
  newStatus: text("new_status").notNull(),
  changedBy: uuid("changed_by").references(() => users.id),
  note: text("note"),
  changedAt: createdAt(),
}, (t) => [index("status_history_app_idx").on(t.applicationId)]);

export const submissions = pgTable("submissions", {
  id: id(),
  applicationId: uuid("application_id").notNull().references(() => applications.id),
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  attachmentDocumentId: uuid("attachment_document_id").references(() => documents.id),
  provider: text("provider").notNull(),
  providerMessageId: text("provider_message_id"),
  status: submissionStatusEnum("status").notNull().default("pending"),
  error: text("error"),
  sentAt: ts("sent_at"),
  triggeredBy: uuid("triggered_by").notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index("submissions_app_idx").on(t.applicationId)]);

export const responseDocuments = pgTable("response_documents", {
  id: id(),
  applicationId: uuid("application_id").notNull().references(() => applications.id),
  documentId: uuid("document_id").notNull().references(() => documents.id),
  receivedOn: date("received_on", { mode: "string" }).notNull(),
  confirmedAhvLast4: text("confirmed_ahv_last4").notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Portfolio                                                           */
/* ------------------------------------------------------------------ */

export const foundations = pgTable("foundations", {
  id: id(),
  name: text("name").notNull(),
  address: text("address"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("foundations_name_uq").on(sql`lower(${t.name})`)]);

export const portfolios = pgTable("portfolios", {
  id: id(),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  addedBy: uuid("added_by").notNull().references(() => users.id),
  addedAt: createdAt(),
  removedAt: ts("removed_at"),
  removedBy: uuid("removed_by").references(() => users.id),
}, (t) => [uniqueIndex("portfolios_customer_uq").on(t.customerId)]);

export const portfolioFoundations = pgTable("portfolio_foundations", {
  id: id(),
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id),
  foundationId: uuid("foundation_id").notNull().references(() => foundations.id),
  accountOpenedOn: date("account_opened_on", { mode: "string" }),
  remark: text("remark"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("portfolio_foundation_uq").on(t.portfolioId, t.foundationId)]);

export const transferOrders = pgTable("transfer_orders", {
  id: id(),
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id),
  foundationId: uuid("foundation_id").notNull().references(() => foundations.id),
  orderDate: date("order_date", { mode: "string" }).notNull(),
  status: transferOrderStatusEnum("status").notNull().default("erteilt"),
  orderAmount: chf("order_amount"),
  receivedOn: date("received_on", { mode: "string" }),
  receivedAmount: chf("received_amount"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("transfer_orders_portfolio_idx").on(t.portfolioId)]);

export const transactions = pgTable("transactions", {
  id: id(),
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id),
  foundationId: uuid("foundation_id").notNull().references(() => foundations.id),
  transferOrderId: uuid("transfer_order_id").references(() => transferOrders.id),
  kind: transactionKindEnum("kind").notNull().default("eingang"),
  amount: chf("amount").notNull(),
  orderDate: date("order_date", { mode: "string" }),
  receivedOn: date("received_on", { mode: "string" }),
  remark: text("remark"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: ts("deleted_at"),
}, (t) => [index("transactions_portfolio_idx").on(t.portfolioId)]);

/* ------------------------------------------------------------------ */
/* Notes, audit, notifications, settings                               */
/* ------------------------------------------------------------------ */

export const notes = pgTable("notes", {
  id: id(),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  applicationId: uuid("application_id").references(() => applications.id),
  /** visible only to Pensora roles */
  internalOnly: boolean("internal_only").notNull().default(false),
  body: text("body").notNull(),
  authorId: uuid("author_id").notNull().references(() => users.id),
  createdAt: createdAt(),
  editedAt: ts("edited_at"),
}, (t) => [index("notes_customer_idx").on(t.customerId)]);

export const noteRevisions = pgTable("note_revisions", {
  id: id(),
  noteId: uuid("note_id").notNull().references(() => notes.id),
  previousBody: text("previous_body").notNull(),
  editedBy: uuid("edited_by").notNull().references(() => users.id),
  editedAt: createdAt(),
});

export const activityLog = pgTable("activity_log", {
  id: id(),
  actorId: uuid("actor_id").references(() => users.id),
  actorLabel: text("actor_label"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  customerId: uuid("customer_id").references(() => customers.id),
  summary: text("summary").notNull(),
  changes: jsonb("changes").$type<Record<string, { from: unknown; to: unknown }>>(),
  ip: text("ip"),
  createdAt: createdAt(),
}, (t) => [
  index("activity_customer_idx").on(t.customerId, t.createdAt),
  index("activity_created_idx").on(t.createdAt),
]);

export const notifications = pgTable("notifications", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body"),
  link: text("link"),
  readAt: ts("read_at"),
  createdAt: createdAt(),
}, (t) => [index("notifications_user_idx").on(t.userId, t.readAt)]);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: updatedAt(),
});
