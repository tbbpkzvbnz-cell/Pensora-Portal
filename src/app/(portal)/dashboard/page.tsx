import Link from "next/link";
import type { Metadata } from "next";
import { requireActor } from "@/server/auth/session";
import { ROLE_LABELS } from "@/server/authz";
import { dashboardData } from "@/server/services/dashboard";
import { ButtonLink, Card, EmptyRow, PageHeader, Stat, Table, Td, Th } from "@/components/ui";
import { formatChf, formatDate, formatDateTime } from "@/lib/format";
import { OUTCOME_STATUS_LABELS, REVIEW_STATUS_LABELS } from "@/lib/labels";

export const metadata: Metadata = { title: "Dashboard" };

const statusLabel = (kind: string, s: string) =>
  kind === "review" ? REVIEW_STATUS_LABELS[s as keyof typeof REVIEW_STATUS_LABELS] : kind === "outcome" ? OUTCOME_STATUS_LABELS[s as keyof typeof OUTCOME_STATUS_LABELS] : "Antrag gestartet";

export default async function DashboardPage() {
  const actor = await requireActor("dashboard.view");
  const d = await dashboardData(actor);
  const r = actor.role;
  const isAdvisor = r === "broker_advisor" || r === "pensora_advisor";
  return (
    <>
      <PageHeader
        title={`Guten Tag, ${actor.firstName}`}
        subtitle={ROLE_LABELS[r]}
        actions={actor.permissions.has("customers.create") && <ButtonLink href="/kunden/neu">Neuer Kunde</ButtonLink>}
      />

      {r === "pensora_gl" && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Kunden gesamt" value={d.customers.toLocaleString("de-CH")} hint={`${d.customersNew30} neu erfasst (30 Tage)`} href="/kunden" />
          <Stat label="Eingereichte Anträge" value={d.submitted} hint={`${d.inCapture} in Erfassung`} href="/antraege" />
          <Stat label="Ausstehende Rückmeldungen" value={d.waiting} href="/antraege?status=warten_auf_antwort" />
          <Stat label="Eröffnete Konten" value={d.opened} href="/antraege?status=konto_eroeffnet" />
          <Stat label="Eingegangene Gelder" value={formatChf(d.money?.received)} href="/portfolio" />
          <Stat label="Überweisungsaufträge (Betrag)" value={formatChf(d.money?.transferred)} hint="Summe erteilter Aufträge" href="/portfolio" />
          {d.backoffice && <Stat label="Neu zur Prüfung" value={d.backoffice.newIn} href="/pruefung?status=neu_eingegangen" />}
          {d.backoffice && <Stat label="Bereit zur Übermittlung" value={d.backoffice.ready} href="/pruefung?status=bereit_zur_uebermittlung" />}
        </div>
      )}

      {r === "pensora_backoffice" && d.backoffice && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Eingegangene Dokumente zur Prüfung" value={d.docsToReview} hint={`${d.backoffice.newIn} neue Anträge`} href="/pruefung?status=neu_eingegangen" />
          <Stat label="Noch nicht bearbeitet / in Prüfung" value={d.backoffice.newIn + d.backoffice.inReview} href="/pruefung" />
          <Stat label="Bereit zur Übermittlung" value={d.backoffice.ready} href="/pruefung?status=bereit_zur_uebermittlung" />
          <Stat label="Bereits übermittelt" value={d.backoffice.transmitted} hint={`${d.backoffice.responses30} Rückmeldungen (30 Tage)`} href="/pruefung/uebermittlungen" />
        </div>
      )}

      {r === "broker_gl" && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Eigene Berater" value={d.advisorCount ?? 0} href="/mitarbeiter" />
          <Stat label="Eigene Kunden" value={d.customers} href="/kunden" />
          <Stat label="Eingereichte Anträge" value={d.submitted} href="/antraege" />
        </div>
      )}

      {isAdvisor && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Eigene Kunden" value={d.customers} href="/kunden" />
          <Stat label="Eingereichte Anträge" value={d.submitted} href="/antraege" />
          <Stat label="Offene Kundenfälle" value={d.openCases} hint="Neu, unvollständig oder bereit" href="/kunden?status=unterlagen_unvollstaendig" />
          <Stat label="Konten eröffnet" value={d.opened} href="/antraege?status=konto_eroeffnet" />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {(r === "pensora_gl" || r === "broker_gl") && d.byAdvisor.length > 0 && (
          <Card title={r === "broker_gl" ? "Kunden nach Mitarbeitern" : "Übersicht nach Beratern"}>
            <div className="-m-5">
              <Table>
                <thead><tr><Th>Berater</Th>{r === "pensora_gl" && <Th>Broker</Th>}<Th className="text-right">Kunden</Th><Th className="text-right">Anträge</Th></tr></thead>
                <tbody>
                  {d.byAdvisor.map((a) => (
                    <tr key={a.name + a.broker}><Td>{a.name}</Td>{r === "pensora_gl" && <Td>{a.broker ?? "Pensora"}</Td>}<Td className="text-right tabular-nums">{a.customers}</Td><Td className="text-right tabular-nums">{a.submitted}</Td></tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>
        )}
        {r === "pensora_gl" && (
          <Card title="Übersicht nach Brokerfirmen">
            <div className="-m-5">
              <Table>
                <thead><tr><Th>Brokerfirma</Th><Th className="text-right">Kunden</Th><Th className="text-right">Anträge</Th></tr></thead>
                <tbody>
                  {d.byBroker.length === 0 && <EmptyRow cols={3} />}
                  {d.byBroker.map((b) => <tr key={b.name ?? "p"}><Td>{b.name ?? "Pensora (intern)"}</Td><Td className="text-right tabular-nums">{b.customers}</Td><Td className="text-right tabular-nums">{b.submitted}</Td></tr>)}
                </tbody>
              </Table>
            </div>
          </Card>
        )}
        {r !== "pensora_backoffice" && (
          <Card title="Neueste Kundenaktivitäten">
            <ul className="divide-y divide-line text-sm">
              {d.recentActivity.length === 0 && <li className="py-2 text-muted">Noch keine Aktivitäten.</li>}
              {d.recentActivity.map((a) => (
                <li key={a.id} className="py-2">
                  <Link href={`/kunden/${a.customerId}`} className="font-medium text-brand-700 hover:underline">{a.first} {a.last}</Link> · {a.summary}
                  <div className="text-xs text-muted">{formatDateTime(a.createdAt)} · {a.actorLabel ?? "System"}</div>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card title={r === "pensora_backoffice" ? "Neueste Statusänderungen" : "Neueste Anträge und Statusänderungen"}>
          <ul className="divide-y divide-line text-sm">
            {d.recentStatus.length === 0 && <li className="py-2 text-muted">Noch keine Anträge.</li>}
            {d.recentStatus.map((s) => (
              <li key={s.id} className="flex justify-between gap-3 py-2">
                <span><Link href={`/antraege/${s.appId}`} className="font-medium text-brand-700 hover:underline">{s.first} {s.last}</Link> · {statusLabel(s.kind, s.newStatus)}</span>
                <span className="whitespace-nowrap text-xs text-muted">{formatDateTime(s.changedAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
        {d.backoffice && (
          <Card title="Neueste Rückmeldungen der Zentralstelle">
            <ul className="divide-y divide-line text-sm">
              {d.recentResponses.length === 0 && <li className="py-2 text-muted">Noch keine Rückmeldungen erfasst.</li>}
              {d.recentResponses.map((x) => (
                <li key={x.id} className="flex justify-between py-2"><Link href={`/pruefung/${x.appId}`} className="text-brand-700 hover:underline">{x.first} {x.last}</Link><span className="text-xs text-muted">Eingang {formatDate(x.receivedOn)}</span></li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
