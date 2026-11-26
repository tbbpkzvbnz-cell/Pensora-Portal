import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { NotFoundError } from "@/server/authz";
import { getBroker } from "@/server/services/brokers";
import { Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { ConfirmAction } from "@/components/forms";
import { BrokerForm } from "../broker-form";
import { setBrokerActiveAction, updateBrokerAction } from "../../actions";

export default async function BrokerDetailPage({ params }: PageProps<"/mitarbeiter/broker/[id]">) {
  const actor = await requireActor("brokers.manage");
  const { id } = await params;
  const b = await getBroker(actor, id).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; });
  return (
    <>
      <PageHeader
        title={b.name}
        subtitle={b.active ? <Badge tone="green">Aktiv</Badge> : <Badge>Inaktiv</Badge>}
        breadcrumb={[{ href: "/mitarbeiter/broker", label: "Brokerfirmen" }]}
        actions={
          <>
            <ButtonLink variant="secondary" href={`/mitarbeiter?broker=${b.id}`}>Mitarbeiter</ButtonLink>
            <ButtonLink variant="secondary" href={`/kunden?broker=${b.id}`}>Kunden</ButtonLink>
            {b.active ? (
              <ConfirmAction action={setBrokerActiveAction} fields={{ id: b.id, active: "false" }} label="Deaktivieren" title="Brokerfirma deaktivieren?" message="Alle Benutzer dieser Firma werden ebenfalls deaktiviert und sofort abgemeldet. Kunden und Anträge bleiben erhalten." confirmLabel="Deaktivieren" danger />
            ) : (
              <ConfirmAction action={setBrokerActiveAction} fields={{ id: b.id, active: "true" }} label="Aktivieren" title="Brokerfirma aktivieren?" message="Benutzer der Firma müssen einzeln wieder aktiviert werden." confirmLabel="Aktivieren" />
            )}
          </>
        }
      />
      <Card title="Firmendaten"><BrokerForm action={updateBrokerAction} broker={b} /></Card>
    </>
  );
}
