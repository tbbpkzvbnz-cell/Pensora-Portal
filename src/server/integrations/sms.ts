import "server-only";
import { env } from "../env";

export interface SmsProvider {
  readonly name: string;
  send(to: string, text: string): Promise<{ id: string }>;
}

export type IntegrationState = { name: string; active: boolean; mode: "aktiv" | "nicht aktiv" | "Entwicklungsmodus"; detail: string };

class TwilioSms implements SmsProvider {
  readonly name = "twilio";
  constructor(private sid: string, private token: string, private from: string) {}
  async send(to: string, text: string) {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.sid)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${this.sid}:${this.token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: this.from, Body: text }),
    });
    const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok || !json.sid) throw new Error(`Twilio: ${json.message ?? res.status}`);
    return { id: json.sid };
  }
}

class AspSms implements SmsProvider {
  readonly name = "aspsms";
  constructor(private userKey: string, private password: string, private originator: string) {}
  async send(to: string, text: string) {
    const res = await fetch("https://json.aspsms.com/SendSimpleTextSMS", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        UserName: this.userKey,
        Password: this.password,
        Originator: this.originator,
        Recipients: [to],
        MessageText: text,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { StatusCode?: string; StatusInfo?: string };
    if (!res.ok || json.StatusCode !== "1") throw new Error(`ASPSMS: ${json.StatusInfo ?? res.status}`);
    return { id: `aspsms-${Date.now()}` };
  }
}

/** Development only: writes the SMS to the server log. Refused in production (see env.ts). */
class DevLogSms implements SmsProvider {
  readonly name = "dev-log";
  async send(to: string, text: string) {
    console.warn(`[SMS dev-log] an ${to}: ${text}`);
    return { id: `dev-${Date.now()}` };
  }
}

export class IntegrationInactiveError extends Error {
  constructor(what: string) {
    super(`${what} ist nicht aktiv. Bitte Zugangsdaten in der Konfiguration hinterlegen.`);
    this.name = "IntegrationInactiveError";
  }
}

export function getSmsProvider(): SmsProvider | null {
  switch (env.SMS_PROVIDER) {
    case "twilio":
      if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) return new TwilioSms(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.SMS_SENDER);
      return null;
    case "aspsms":
      if (env.ASPSMS_USER_KEY && env.ASPSMS_PASSWORD) return new AspSms(env.ASPSMS_USER_KEY, env.ASPSMS_PASSWORD, env.SMS_SENDER);
      return null;
    case "dev-log":
      return new DevLogSms();
    default:
      return null;
  }
}

export async function sendSms(to: string, text: string) {
  const p = getSmsProvider();
  if (!p) throw new IntegrationInactiveError("Die SMS-Schnittstelle");
  return p.send(to, text);
}

export function smsState(): IntegrationState {
  const p = getSmsProvider();
  if (!p) return { name: "SMS", active: false, mode: "nicht aktiv", detail: env.SMS_PROVIDER ? `${env.SMS_PROVIDER}: Zugangsdaten fehlen` : "Kein Anbieter konfiguriert" };
  if (p.name === "dev-log") return { name: "SMS", active: true, mode: "Entwicklungsmodus", detail: "SMS werden nur ins Server-Log geschrieben" };
  return { name: "SMS", active: true, mode: "aktiv", detail: `Anbieter: ${p.name}` };
}
