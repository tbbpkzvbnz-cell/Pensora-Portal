import Image from "next/image";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Image src="/pensora-logo.png" alt="Pensora – Ihr Kapital. Ihre Zukunft" width={180} height={59} priority />
        </div>
        <div className="rounded-2xl border border-line bg-white p-8 shadow-sm">{children}</div>
        <p className="mt-6 text-center text-xs text-muted">Pensora GmbH · Steinackerstrasse 2 · 8302 Kloten</p>
      </div>
    </div>
  );
}
