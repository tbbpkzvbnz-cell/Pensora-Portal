import Link from "next/link";
import type { Metadata } from "next";
import { requireActor } from "@/server/auth/session";
import { can } from "@/server/authz";
import { listCustomers } from "@/server/services/customers";
import { listApplications } from "@/server/services/applications";
import { Card, PageHeader } from "@/components/ui";
import { ApplicationStatus, IntakeBadge } from "@/components/status-badges";
import { sp1 } from "@/components/table-nav";
import { formatDate, formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Suche" };

export default async function SearchPage({ searchParams }: PageProps<"/suche">) {
  const actor = await requireActor();
  const q = sp1(await searchParams, "q").trim();
  const [cust, apps] = q.length >= 2
    ? await Promise.all([
        can(actor, "customers.view") ? listCustomers(actor, { q, pageSize: 20 }) : null,
        can(actor, "applications.view") ? listApplications(actor, { q, view: "alle", pageSize: 20 }) : null,
      ])
    : [null, null];
  return (
    <>
      <PageHeader title="Suche" subtitle={q ? `Ergebnisse für „${q}“` : "Bitte mindestens 2 Zeichen eingeben."} />
      {q.length >= 2 && (
        <div className="grid gap-6 xl:grid-cols-2">
          {cust && (
            <Card title={`Kunden (${cust.total})`}>
              <ul className="divide-y divide-line text-sm">
                {cust.rows.length === 0 && <li className="py-2 text-muted">Keine Kunden gefunden.</li>}
                {cust.rows.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                    <span><Link href={`/kunden/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.lastName} {c.firstName}</Link> <span className="text-muted">· {formatDate(c.birthDate)} · {c.city}</span></span>
                    <IntakeBadge s={c.intakeStatus} />
                  </li>
                ))}
              </ul>
              {cust.total > 20 && <Link href={`/kunden?q=${encodeURIComponent(q)}`} className="mt-3 inline-block text-sm text-brand-700 hover:underline">Alle {cust.total} anzeigen ›</Link>}
            </Card>
          )}
          {apps && (
            <Card title={`Anträge (${apps.total})`}>
              <ul className="divide-y divide-line text-sm">
                {apps.rows.length === 0 && <li className="py-2 text-muted">Keine Anträge gefunden.</li>}
                {apps.rows.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                    <span><Link href={`/antraege/${a.id}`} className="font-medium text-brand-700 hover:underline">{a.lastName} {a.firstName}</Link> <span className="text-muted">· {formatDateTime(a.submittedToPensoraAt ?? a.createdAt)}</span></span>
                    <ApplicationStatus review={a.reviewStatus} outcome={a.outcomeStatus} phase={a.phase} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
