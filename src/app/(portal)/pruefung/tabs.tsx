import { Tabs } from "@/components/ui";

export function ReviewTabs({ active }: { active: "eingang" | "uebermittlungen" | "antworten" }) {
  return (
    <Tabs
      active={active}
      tabs={[
        { key: "eingang", href: "/pruefung", label: "Eingang zur Überprüfung" },
        { key: "uebermittlungen", href: "/pruefung/uebermittlungen", label: "Übermittlungen" },
        { key: "antworten", href: "/pruefung/antwortdokumente", label: "Antwortdokumente erfassen" },
      ]}
    />
  );
}
