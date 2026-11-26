import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden" };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Anmelden</h1>
      <p className="mt-1 text-sm text-muted">Mit E-Mail-Adresse oder Telefonnummer und Passwort. Anschliessend erhalten Sie einen SMS-Code.</p>
      <div className="mt-6"><LoginForm /></div>
      <div className="mt-6 text-center text-sm">
        <Link href="/passwort-vergessen" className="text-brand-600 hover:underline">Passwort vergessen?</Link>
      </div>
    </>
  );
}
