import { notFound, redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { can, NotFoundError } from "@/server/authz";
import { getCustomer } from "@/server/services/customers";
import { Card, PageHeader } from "@/components/ui";
import { CustomerForm } from "../../customer-form";
import { updateCustomerAction } from "../../actions";

export default async function EditCustomerPage({ params }: PageProps<"/kunden/[id]/bearbeiten">) {
  const actor = await requireActor("customers.edit");
  const { id } = await params;
  const { customer: c } = await getCustomer(actor, id).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; });
  if (c.intakeStatus === "antrag_eingereicht" && !can(actor, "customers.edit_after_submission")) redirect(`/kunden/${id}`);
  return (
    <>
      <PageHeader title="Stammdaten bearbeiten" subtitle={`${c.firstName} ${c.lastName}`} breadcrumb={[{ href: "/kunden", label: "Kunden" }, { href: `/kunden/${id}`, label: `${c.firstName} ${c.lastName}` }]} />
      <Card><CustomerForm action={updateCustomerAction} customer={c} cancelHref={`/kunden/${id}`} /></Card>
    </>
  );
}
