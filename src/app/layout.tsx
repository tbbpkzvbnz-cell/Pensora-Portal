import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Pensora-Portal", template: "%s · Pensora-Portal" },
  description: "Pensora CRM- und Verwaltungsportal",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#5b168a" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de-CH" className="h-full antialiased">
      <body className="min-h-full font-sans text-[15px]">{children}</body>
    </html>
  );
}
