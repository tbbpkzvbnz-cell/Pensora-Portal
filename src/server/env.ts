import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DOCUMENT_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "DOCUMENT_ENCRYPTION_KEY muss 32 Byte (base64) sein"),

  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  SMS_PROVIDER: z.enum(["", "twilio", "aspsms", "dev-log"]).default(""),
  SMS_SENDER: z.string().default("Pensora"),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  ASPSMS_USER_KEY: z.string().optional(),
  ASPSMS_PASSWORD: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  /** STARTTLS is required unless explicitly disabled (only for local test mail sinks). */
  SMTP_REQUIRE_TLS: z.enum(["true", "false"]).default("true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

const parsed = schema.safeParse(
  Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, v === "" && k !== "SMS_PROVIDER" ? undefined : v])),
);
if (!parsed.success) {
  throw new Error("Ungültige Konfiguration: " + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
}
if (parsed.data.NODE_ENV === "production" && parsed.data.SMS_PROVIDER === "dev-log" && process.env.NEXT_PHASE !== "phase-production-build") {
  throw new Error("SMS_PROVIDER=dev-log ist im Produktionsbetrieb nicht erlaubt.");
}

export const env = parsed.data;
