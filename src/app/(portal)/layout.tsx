import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { ROLE_LABELS } from "@/server/authz/permissions";
import { NAV } from "@/components/nav";
import { Sidebar } from "@/components/sidebar";
import { GlobalSearch } from "@/components/global-search";
import { NotificationBell } from "@/components/notification-bell";
import { logoutAction } from "../(auth)/actions";

export default async function PortalLayout({ children }: LayoutProps<"/">) {
  const actor = await requireActor();
  const items = NAV.filter((n) => n.any.length === 0 || n.any.some((p) => actor.permissions.has(p))).map(({ href, label, icon }) => ({ href, label, icon }));
  return (
    <div className="min-h-screen bg-white">
      <Sidebar
        items={items}
        footer={
          <div className="flex items-center justify-between gap-2 px-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{actor.firstName} {actor.lastName}</div>
              <div className="truncate text-xs text-muted">{ROLE_LABELS[actor.role]}</div>
            </div>
            <form action={logoutAction}>
              <button className="rounded-lg p-2 text-muted hover:bg-surface hover:text-ink" title="Abmelden" aria-label="Abmelden"><LogOut className="h-4 w-4" /></button>
            </form>
          </div>
        }
      />
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-white/95 px-4 pl-16 backdrop-blur lg:px-8">
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-2">
            <Suspense fallback={null}><NotificationBell userId={actor.id} /></Suspense>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
