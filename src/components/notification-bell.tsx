import Link from "next/link";
import { Bell } from "lucide-react";
import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { notifications } from "@/server/db/schema";

export async function NotificationBell({ userId }: { userId: string }) {
  const [{ n }] = await db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return (
    <Link href="/benachrichtigungen" className="relative rounded-lg p-2 text-muted hover:bg-surface hover:text-ink" aria-label={`Benachrichtigungen (${n} ungelesen)`}>
      <Bell className="h-5 w-5" />
      {n > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-brand-600 px-1 text-center text-[11px] font-semibold leading-5 text-white">{n > 99 ? "99+" : n}</span>}
    </Link>
  );
}
