import type { Permission } from "@/server/authz/permissions";

export type NavItem = { href: string; label: string; icon: string; any: Permission[] };

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", any: ["dashboard.view"] },
  { href: "/kunden", label: "Kunden", icon: "Users", any: ["customers.view"] },
  { href: "/antraege", label: "Anträge", icon: "FileText", any: ["applications.view"] },
  { href: "/pruefung", label: "Überprüfungen & Übermittlungen", icon: "ClipboardCheck", any: ["review.access"] },
  { href: "/portfolio", label: "Portfolio", icon: "Briefcase", any: ["portfolio.view"] },
  { href: "/mitarbeiter", label: "Mitarbeiterverwaltung", icon: "UserCog", any: ["users.manage", "users.view_own_firm", "brokers.manage"] },
  { href: "/einstellungen", label: "Einstellungen", icon: "Settings", any: [] },
];
