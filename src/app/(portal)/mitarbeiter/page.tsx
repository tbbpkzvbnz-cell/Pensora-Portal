import Link from "next/link";
import type { Metadata } from "next";
import { requireActor } from "@/server/auth/session";
import { can, ROLE_LABELS, ROLES, AuthzError } from "@/server/authz";
import { listUsers } from "@/server/services/users";
import { listBrokers } from "@/server/services/brokers";
import { Badge, ButtonLink, EmptyRow, Input, PageHeader, Select, Table, Td, Th, btn } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { StaffTabs } from "./tabs";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Mitarbeiterverwaltung" };

export default async function StaffPage({ searchParams }: PageProps<"/mitarbeiter">) {
  const actor = await requireActor();
  if (!can(actor, "users.manage") && !can(actor, "users.view_own_firm")) redirect("/kein-zugriff");
  const sp = await searchParams;
  const f = { q: String(sp.q ?? ""), role: String(sp.role ?? ""), brokerFirmId: String(sp.broker ?? ""), status: String(sp.status ?? "") };
  const [rows, brokers] = await Promise.all([
    listUsers(actor, f).catch((e) => { if (e instanceof AuthzError) redirect("/kein-zugriff"); throw e; }),
    listBrokers(actor),
  ]);
  const manage = can(actor, "users.manage");
  return (
    <>
      <PageHeader
        title="Mitarbeiterverwaltung"
        subtitle={manage ? "Pensora-Mitarbeiter und Benutzer der Brokerfirmen" : "Mitarbeiter Ihrer Brokerfirma"}
        actions={manage && <ButtonLink href="/mitarbeiter/neu">Neuer Benutzer</ButtonLink>}
      />
      <StaffTabs active="users" showBrokers={can(actor, "brokers.manage")} />
      <form className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input name="q" placeholder="Name, E-Mail, Telefon" defaultValue={f.q} className="lg:col-span-2" />
        <Select name="role" defaultValue={f.role}>
          <option value="">Alle Rollen</option>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </Select>
        {manage && (
          <Select name="broker" defaultValue={f.brokerFirmId}>
            <option value="">Alle Firmen</option>
            <option value="pensora">Pensora (intern)</option>
            {brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
        <div className="flex gap-2">
          <Select name="status" defaultValue={f.status}>
            <option value="">Alle Status</option>
            <option value="active">Aktiv</option>
            <option value="disabled">Deaktiviert</option>
          </Select>
          <button className={btn.secondary}>Filtern</button>
        </div>
      </form>
      <Table>
        <thead>
          <tr><Th>Name</Th><Th>Rolle</Th><Th>Brokerfirma</Th><Th>E-Mail</Th><Th>Telefon</Th><Th className="text-right">Kunden</Th><Th>Letzte Anmeldung</Th><Th>Status</Th></tr>
        </thead>
        <tbody>
          {rows.length === 0 && <EmptyRow cols={8} />}
          {rows.map((u) => (
            <tr key={u.id} className="hover:bg-surface">
              <Td>{manage ? <Link href={`/mitarbeiter/${u.id}`} className="font-medium text-brand-700 hover:underline">{u.lastName} {u.firstName}</Link> : <span className="font-medium">{u.lastName} {u.firstName}</span>}</Td>
              <Td>{ROLE_LABELS[u.role]}</Td>
              <Td>{u.brokerName ?? <span className="text-muted">Pensora</span>}</Td>
              <Td>{u.email}</Td>
              <Td className="whitespace-nowrap">{formatPhone(u.phone)}</Td>
              <Td className="text-right tabular-nums">{u.customerCount}</Td>
              <Td className="whitespace-nowrap">{formatDateTime(u.lastLoginAt)}</Td>
              <Td>{u.status === "active" ? <Badge tone="green">Aktiv</Badge> : <Badge tone="gray">Deaktiviert</Badge>}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
