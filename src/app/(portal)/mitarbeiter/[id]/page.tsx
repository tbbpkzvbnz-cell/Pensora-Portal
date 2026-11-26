import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { NotFoundError, ROLE_LABELS } from "@/server/authz";
import { getUser } from "@/server/services/users";
import { listBrokers } from "@/server/services/brokers";
import { Alert, Badge, Card, DefinitionList, Field, Input, PageHeader } from "@/components/ui";
import { ConfirmAction } from "@/components/forms";
import { formatDateTime } from "@/lib/format";
import { UserForm } from "../user-form";
import { deleteUserAction, resetPasswordLinkAction, setPasswordAction, setUserStatusAction, updateUserAction } from "../actions";

export default async function UserDetailPage({ params, searchParams }: PageProps<"/mitarbeiter/[id]">) {
  const actor = await requireActor("users.manage");
  const { id } = await params;
  const sp = await searchParams;
  const user = await getUser(actor, id).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; });
  const brokers = await listBrokers(actor);
  const self = user.id === actor.id;
  return (
    <>
      <PageHeader
        title={`${user.firstName} ${user.lastName}`}
        subtitle={<>{ROLE_LABELS[user.role]} · {user.status === "active" ? <Badge tone="green">Aktiv</Badge> : <Badge>Deaktiviert</Badge>}</>}
        breadcrumb={[{ href: "/mitarbeiter", label: "Mitarbeiterverwaltung" }]}
      />
      {sp.neu && <div className="mb-4"><Alert tone="success">Benutzer wurde erstellt. Die Anmeldung erfolgt mit E-Mail oder Telefonnummer, Passwort und SMS-Code.</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card title="Stammdaten"><UserForm action={updateUserAction} brokers={brokers} user={user} /></Card>
        </div>
        <div className="space-y-6">
          <Card title="Konto">
            <DefinitionList items={[["Erstellt", formatDateTime(user.createdAt)], ["Letzte Anmeldung", formatDateTime(user.lastLoginAt)]]} />
            {!self && (
              <div className="mt-5 flex flex-wrap gap-2">
                {user.status === "active" ? (
                  <ConfirmAction action={setUserStatusAction} fields={{ id: user.id, status: "disabled" }} label="Deaktivieren" title="Benutzer deaktivieren?" message="Der Benutzer kann sich nicht mehr anmelden; laufende Sitzungen werden sofort beendet. Daten bleiben erhalten." confirmLabel="Deaktivieren" danger />
                ) : (
                  <ConfirmAction action={setUserStatusAction} fields={{ id: user.id, status: "active" }} label="Aktivieren" title="Benutzer aktivieren?" message="Der Benutzer kann sich wieder anmelden." confirmLabel="Aktivieren" />
                )}
                <ConfirmAction action={deleteUserAction} fields={{ id: user.id }} label="Löschen" title="Benutzer löschen?" message="Löschen ist nur möglich, wenn keine Kunden oder Anträge mit dem Benutzer verknüpft sind (Aufbewahrungspflicht). Der Benutzer wird anonymisiert; das Protokoll bleibt erhalten." confirmLabel="Endgültig löschen" variant="danger" danger />
              </div>
            )}
          </Card>
          <Card title="Passwort">
            <div className="space-y-4">
              <ConfirmAction action={resetPasswordLinkAction} fields={{ id: user.id }} label="Reset-Link senden" title="Reset-Link senden?" message="Der Benutzer erhält einen 30 Minuten gültigen Link per E-Mail (oder SMS, falls E-Mail nicht aktiv)." confirmLabel="Senden" />
              <ConfirmAction action={setPasswordAction} fields={{ id: user.id }} label="Passwort direkt setzen" title="Neues Passwort setzen" message="Alle Sitzungen des Benutzers werden beendet. Teilen Sie das Passwort auf sicherem Weg mit." confirmLabel="Passwort setzen">
                <Field label="Neues Passwort"><Input name="password" type="password" autoComplete="new-password" required /></Field>
              </ConfirmAction>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
