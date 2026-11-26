import { Tabs } from "@/components/ui";

export function StaffTabs({ active, showBrokers }: { active: "users" | "brokers"; showBrokers: boolean }) {
  const tabs = [{ key: "users", href: "/mitarbeiter", label: "Benutzer" }];
  if (showBrokers) tabs.push({ key: "brokers", href: "/mitarbeiter/broker", label: "Brokerfirmen" });
  return <Tabs tabs={tabs} active={active} />;
}
