import { requireActor } from "@/server/auth/session";
import { PageHeader } from "@/components/ui";

export default async function DashboardPage() {
  const actor = await requireActor("dashboard.view");
  return <PageHeader title={`Guten Tag, ${actor.firstName}`} />;
}
