import "server-only";
import nodemailer from "nodemailer";
import { env } from "../env";
import type { IntegrationState } from "./sms";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
};

export interface EmailProvider {
  readonly name: string;
  /** Resolves only when the server accepted the message; throws otherwise. */
  send(msg: EmailMessage): Promise<{ messageId: string }>;
}

class SmtpEmail implements EmailProvider {
  readonly name = "smtp";
  private transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === "true",
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    requireTLS: env.SMTP_SECURE !== "true" && env.SMTP_REQUIRE_TLS === "true",
  });
  async send(msg: EmailMessage) {
    const info = await this.transport.sendMail({ from: env.SMTP_FROM, ...msg });
    if (info.rejected.length > 0 || info.accepted.length === 0) {
      throw new Error(`Empfänger abgelehnt: ${info.rejected.join(", ") || msg.to}`);
    }
    return { messageId: info.messageId };
  }
}

export function getEmailProvider(): EmailProvider | null {
  if (env.SMTP_HOST && env.SMTP_FROM) return new SmtpEmail();
  return null;
}

export function emailState(): IntegrationState {
  const p = getEmailProvider();
  return p
    ? { name: "E-Mail", active: true, mode: "aktiv", detail: `SMTP ${env.SMTP_HOST}, Absender ${env.SMTP_FROM}` }
    : { name: "E-Mail", active: false, mode: "nicht aktiv", detail: "SMTP-Zugang des Pensora-Geschäftspostfachs fehlt" };
}
