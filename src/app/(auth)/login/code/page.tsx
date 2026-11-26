import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getPendingSession } from "@/server/auth/session";
import { maskedPhone } from "@/server/auth/login";
import { CodeForm } from "./code-form";

export const metadata: Metadata = { title: "SMS-Code" };

export default async function CodePage() {
  const pending = await getPendingSession();
  if (!pending) redirect("/login");
  return (
    <>
      <h1 className="text-xl font-semibold">SMS-Bestätigung</h1>
      <p className="mt-1 text-sm text-muted">Wir haben einen 6-stelligen Code an {maskedPhone(pending.user.phone)} gesendet.</p>
      <div className="mt-6"><CodeForm /></div>
    </>
  );
}
