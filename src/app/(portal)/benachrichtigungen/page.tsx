import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { requireActor, actorOrThrow } from "@/server/auth/session";
import { db } from "@/server/db";
import { notifications } from "@/server/db/schema";
import { Card, PageHeader, btn } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Benachrichtigungen" };

async function markAllRead() {
  "use server";
  const actor = await actorOrThrow();
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt)));
  revalidatePath("/", "layout");
}

async function openNotification(fd: FormData) {
  "use server";
  const actor = await actorOrThrow();
  const id = String(fd.get("id") ?? "");
  const [n] = await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, actor.id))).returning();
  const { redirect } = await import("next/navigation");
  if (n?.link && n.link.startsWith("/")) redirect(n.link);
  revalidatePath("/benachrichtigungen");
}

export default async function NotificationsPage() {
  const actor = await requireActor();
  const rows = await db.select().from(notifications).where(eq(notifications.userId, actor.id)).orderBy(desc(notifications.createdAt)).limit(100);
  return (
    <>
      <PageHeader title="Benachrichtigungen" actions={<form action={markAllRead}><button className={btn.secondary}>Alle als gelesen markieren</button></form>} />
      <Card>
        <ul className="divide-y divide-line">
          {rows.length === 0 && <li className="py-4 text-sm text-muted">Keine Benachrichtigungen.</li>}
          {rows.map((n) => (
            <li key={n.id} className="py-3">
              <form action={openNotification} className="flex items-start gap-3">
                <input type="hidden" name="id" value={n.id} />
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand-600"}`} />
                <button className="flex-1 text-left">
                  <div className={`text-sm ${n.readAt ? "" : "font-semibold"}`}>{n.title}</div>
                  {n.body && <div className="text-sm text-muted">{n.body}</div>}
                  <div className="text-xs text-muted">{formatDateTime(n.createdAt)}</div>
                </button>
              </form>
            </li>
          ))}
        </ul>
      </Card>
      <p className="mt-4 text-xs text-muted">Benachrichtigungen werden bei neuen Aufgaben automatisch erstellt (z.B. abgeschlossene Kundenerfassung, neuer Antrag, Rückfrage). <Link href="/dashboard" className="underline">Zum Dashboard</Link></p>
    </>
  );
}
