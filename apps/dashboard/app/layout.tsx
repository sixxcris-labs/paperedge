import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PaperEdge Dashboard",
  description: "Dashboard shell for the PaperEdge paper-trading app.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
