import { Tabs } from "@/components/ui";
import type { Actor } from "@/server/authz";

export function SettingsTabs({ actor, active }: { actor: Actor; active: string }) {
  const tabs = [{ key: "profil", href: "/einstellungen", label: "Mein Konto" }];
  if (actor.permissions.has("settings.manage")) {
    tabs.push(
      { key: "rollen", href: "/einstellungen/rollen", label: "Rollen & Berechtigungen" },
      { key: "integrationen", href: "/einstellungen/integrationen", label: "Integrationen" },
      { key: "zentralstelle", href: "/einstellungen/zentralstelle", label: "Zentralstelle & Links" },
    );
  }
  if (actor.permissions.has("portfolio.edit")) tabs.push({ key: "stiftungen", href: "/einstellungen/stiftungen", label: "Stiftungen" });
  if (actor.permissions.has("audit.view")) tabs.push({ key: "protokoll", href: "/einstellungen/protokoll", label: "Protokoll" });
  return <Tabs tabs={tabs} active={active} />;
}
