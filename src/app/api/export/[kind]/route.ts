import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/server/auth/session";
import { AuthzError } from "@/server/authz";
import { listCustomers } from "@/server/services/customers";
import { listApplications } from "@/server/services/applications";
import { listPortfolio } from "@/server/services/portfolio";
import { logActivity } from "@/server/audit";
import { formatAhv } from "@/lib/ahv";
import { toCsv as csv } from "@/lib/csv";
import { formatDate, formatDateTime } from "@/lib/format";
import { INTAKE_STATUS_LABELS, OUTCOME_STATUS_LABELS, REVIEW_STATUS_LABELS } from "@/lib/labels";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/export/[kind]">) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  if (!actor.permissions.has("export.data")) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  const { kind } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  const g = (k: string) => sp.get(k) ?? undefined;
  const MAX = 5000;
  try {
    let rows: (string | number | null | undefined)[][];
    if (kind === "kunden") {
      const r = await listCustomers(actor, { q: g("q"), brokerFirmId: g("broker"), advisorId: g("advisor"), status: g("status"), sort: g("sort"), dir: g("dir"), pageSize: MAX });
      rows = [["Nachname", "Vorname", "Geburtsdatum", "Telefon", "E-Mail", "Wohnort", "Berater", "Brokerfirma", "Erfasst", "Kundenstatus", "Antragsstatus", "Dokumente vollständig"]];
      for (const c of r.rows) {
        const st = c.outcomeStatus ? OUTCOME_STATUS_LABELS[c.outcomeStatus as keyof typeof OUTCOME_STATUS_LABELS] : c.reviewStatus ? REVIEW_STATUS_LABELS[c.reviewStatus as keyof typeof REVIEW_STATUS_LABELS] : "";
        rows.push([c.lastName, c.firstName, formatDate(c.birthDate), c.phone, c.email, c.city, c.advisorName, c.brokerName ?? "Pensora", formatDateTime(c.createdAt), INTAKE_STATUS_LABELS[c.intakeStatus], st, c.hasIdFront && c.hasIdBack && c.hasSignature ? "ja" : "nein"]);
      }
    } else if (kind === "antraege") {
      const r = await listApplications(actor, { view: g("ansicht") === "alle" ? "alle" : "eingereicht", q: g("q"), brokerFirmId: g("broker"), advisorId: g("advisor"), outcome: g("status"), from: g("von"), to: g("bis"), pageSize: MAX });
      rows = [["Nachname", "Vorname", "Geburtsdatum", "AHV-Nr.", "Telefon", "E-Mail", "Berater", "Brokerfirma", "Suchanfrage", "An Zentralstelle", "Prüfstatus", "Antragsstatus"]];
      for (const a of r.rows) {
        rows.push([a.lastName, a.firstName, formatDate(a.birthDate), formatAhv(a.ahvNumber), a.phone, a.email, a.advisorName, a.brokerName ?? "Pensora", formatDateTime(a.submittedToPensoraAt), formatDateTime(a.transmittedAt), a.reviewStatus ? REVIEW_STATUS_LABELS[a.reviewStatus] : "", a.outcomeStatus ? OUTCOME_STATUS_LABELS[a.outcomeStatus] : ""]);
      }
    } else if (kind === "portfolio") {
      const r = await listPortfolio(actor, { q: g("q"), brokerFirmId: g("broker"), advisorId: g("advisor"), pageSize: MAX });
      rows = [["Nachname", "Vorname", "Broker", "Berater", "Stiftungen", "Eingegangen CHF", "Nach Stiftungen", "Letzter Eingang"]];
      for (const p of r.rows) {
        rows.push([p.lastName, p.firstName, p.brokerName ?? "Pensora", p.advisorName, p.foundations?.map((f) => f.name).join(", ") ?? "", Number(p.total).toFixed(2), p.foundations?.map((f) => `${f.name}: ${Number(f.amount).toFixed(2)}`).join(" | ") ?? "", formatDate(p.lastReceivedOn)]);
      }
    } else {
      return NextResponse.json({ error: "Unbekannter Export" }, { status: 404 });
    }
    await logActivity({ actor, action: "export", entityType: kind, summary: `Export ${kind} (${rows.length - 1} Zeilen)` });
    return new NextResponse(csv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pensora-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof AuthzError) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: "Fehler" }, { status: 500 });
  }
}
