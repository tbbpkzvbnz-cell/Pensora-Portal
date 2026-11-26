import Link from "next/link";
import type { Metadata } from "next";
import { and, count, desc, ilike, or } from "drizzle-orm";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { activityLog } from "@/server/db/schema";
import { EmptyRow, Input, PageHeader, Table, Td, Th, btn } from "@/components/ui";
import { Pagination, sp1 } from "@/components/table-nav";
import { formatDateTime } from "@/lib/format";
import { SettingsTabs } from "../nav";

export const metadata: Metadata = { title: "Protokoll" };

export default async function AuditPage({ searchParams }: PageProps<"/einstellungen/protokoll">) {
  const actor = await requireActor("audit.view");
  const sp = await searchParams;
  const q = sp1(sp, "q");
  const page = Number(sp1(sp, "page")) || 1;
  const pageSize = 50;
  const where = q ? or(ilike(activityLog.summary, `%${q}%`), ilike(activityLog.actorLabel, `%${q}%`), ilike(activityLog.action, `%${q}%`)) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(activityLog).where(and(where)).orderBy(desc(activityLog.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(activityLog).where(and(where)),
  ]);
  return (
    <>
      <PageHeader title="Einstellungen" subtitle="Unveränderliches Protokoll aller kritischen Aktionen" />
      <SettingsTabs actor={actor} active="protokoll" />
      <form className="mb-4 flex max-w-md gap-2"><Input name="q" placeholder="Suche in Aktion, Benutzer, Beschreibung" defaultValue={q} /><button className={btn.secondary}>Suchen</button></form>
      <Table>
        <thead><tr><Th>Zeitpunkt</Th><Th>Benutzer</Th><Th>Aktion</Th><Th>Beschreibung</Th><Th>IP</Th></tr></thead>
        <tbody>
          {rows.length === 0 && <EmptyRow cols={5} />}
          {rows.map((r) => (
            <tr key={r.id}>
              <Td className="whitespace-nowrap">{formatDateTime(r.createdAt)}</Td>
              <Td>{r.actorLabel ?? "System"}</Td>
              <Td className="font-mono text-xs">{r.action}</Td>
              <Td>{r.customerId ? <Link className="text-brand-700 hover:underline" href={`/kunden/${r.customerId}?tab=historie`}>{r.summary}</Link> : r.summary}</Td>
              <Td className="text-xs text-muted">{r.ip ?? "–"}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination base="/einstellungen/protokoll" sp={sp} page={page} pageSize={pageSize} total={total} />
    </>
  );
}
