import { requireActor } from "@/server/auth/session";
import { listBrokers } from "@/server/services/brokers";
import { Card, PageHeader } from "@/components/ui";
import { UserForm } from "../user-form";
import { createUserAction } from "../actions";

export default async function NewUserPage() {
  const actor = await requireActor("users.manage");
  const brokers = await listBrokers(actor);
  return (
    <>
      <PageHeader title="Neuer Benutzer" breadcrumb={[{ href: "/mitarbeiter", label: "Mitarbeiterverwaltung" }]} />
      <Card><UserForm action={createUserAction} brokers={brokers} withPassword /></Card>
    </>
  );
}
