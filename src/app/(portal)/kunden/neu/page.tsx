import type { Metadata } from "next";
import { requireActor } from "@/server/auth/session";
import { listAdvisorOptions } from "@/server/services/users";
import { Card, PageHeader } from "@/components/ui";
import { CustomerForm } from "../customer-form";
import { createCustomerAction } from "../actions";

export const metadata: Metadata = { title: "Neuer Kunde" };

export default async function NewCustomerPage() {
  const actor = await requireActor("customers.create");
  const advisors = actor.role === "pensora_gl" ? (await listAdvisorOptions(actor)).filter((a) => a.status === "active") : undefined;
  return (
    <>
      <PageHeader
        title="Neuer Kunde"
        subtitle={advisors ? "Berater und Brokerfirma werden zugeordnet; Erfassungsdatum und -zeit werden automatisch gespeichert." : "Sie werden automatisch als Berater zugeordnet; Erfassungsdatum und -zeit werden automatisch gespeichert."}
        breadcrumb={[{ href: "/kunden", label: "Kunden" }]}
      />
      <Card><CustomerForm action={createCustomerAction} advisors={advisors} cancelHref="/kunden" /></Card>
    </>
  );
}
