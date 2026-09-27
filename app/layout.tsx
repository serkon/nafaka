import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gider Planı — Nafaka ve çocuk giderleri hesaplayıcı",
  description: "Tarihlere, pay oranlarına ve yıllık artışa göre çocuk giderlerini hesapla ve tek aylık ödemeyle karşılaştır.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
