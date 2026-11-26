import Image from "next/image";
import type { Metadata } from "next";
import { resolveCaptureToken } from "@/server/services/applications";
import { formatDateTime } from "@/lib/format";
import { CaptureFlow } from "./capture-flow";

export const metadata: Metadata = { title: "ID und Unterschrift erfassen", robots: { index: false } };

export default async function CapturePage({ params }: PageProps<"/erfassung/[token]">) {
  const { token } = await params;
  const ctx = await resolveCaptureToken(token);
  return (
    <div className="min-h-screen bg-surface">
      <header className="flex justify-center border-b border-line bg-white py-4">
        <Image src="/pensora-logo.png" alt="Pensora" width={120} height={39} priority />
      </header>
      <main className="mx-auto max-w-lg px-4 py-6">
        {!ctx ? (
          <Message title="Link ungültig" text="Dieser Link ist ungültig. Bitte wenden Sie sich an Ihren Berater." />
        ) : ctx.status === "completed" ? (
          <Message title="Bereits erfasst" text="Vielen Dank – Ihre Unterlagen wurden bereits übermittelt. Der Link kann nicht erneut verwendet werden." />
        ) : ctx.status !== "active" ? (
          <Message title="Link abgelaufen" text="Dieser Link ist nicht mehr gültig. Bitte fordern Sie bei Ihrem Berater einen neuen Link an." />
        ) : (
          <>
            <h1 className="text-xl font-semibold">Guten Tag {ctx.displayName}</h1>
            <p className="mt-1 text-sm text-muted">
              Für Ihre Vollmacht zur Abklärung von Vorsorgeguthaben benötigen wir eine Kopie Ihrer Identitätskarte oder Ihres Passes sowie Ihre Unterschrift.
              Der Link ist gültig bis {formatDateTime(ctx.expiresAt)}.
            </p>
            <CaptureFlow token={token} hasIdFront={ctx.hasIdFront} hasIdBack={ctx.hasIdBack} />
          </>
        )}
        <p className="mt-10 text-center text-xs text-muted">Pensora GmbH · Steinackerstrasse 2 · 8302 Kloten<br />Ihre Daten werden verschlüsselt übertragen und gespeichert.</p>
      </main>
    </div>
  );
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-6 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted">{text}</p>
    </div>
  );
}
