import Link from "next/link";
import { validateResetToken } from "@/server/auth/login";
import { ResetForm } from "./reset-form";

export default async function ResetPage({ params }: PageProps<"/passwort-zuruecksetzen/[token]">) {
  const { token } = await params;
  const valid = await validateResetToken(token);
  return (
    <>
      <h1 className="text-xl font-semibold">Neues Passwort festlegen</h1>
      {valid ? (
        <ResetForm token={token} />
      ) : (
        <p className="mt-4 text-sm text-red-700">Der Link ist ungültig oder abgelaufen. <Link href="/passwort-vergessen" className="underline">Neuen Link anfordern</Link></p>
      )}
    </>
  );
}
