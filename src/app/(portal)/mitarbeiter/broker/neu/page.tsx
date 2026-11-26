import { requireActor } from "@/server/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { BrokerForm } from "../broker-form";
import { createBrokerAction } from "../../actions";

export default async function NewBrokerPage() {
  await requireActor("brokers.manage");
  return (
    <>
      <PageHeader title="Neue Brokerfirma" breadcrumb={[{ href: "/mitarbeiter/broker", label: "Brokerfirmen" }]} />
      <Card><BrokerForm action={createBrokerAction} /></Card>
    </>
  );
}
