import Link from "next/link";

export default function NoAccess() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">Kein Zugriff</h1>
        <p className="mt-2 text-muted">Für diesen Bereich fehlt Ihnen die Berechtigung.</p>
        <Link href="/dashboard" className="mt-6 inline-block text-brand-600 underline">Zum Dashboard</Link>
      </div>
    </div>
  );
}
