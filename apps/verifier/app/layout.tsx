import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PaperEdge Verifier",
  description: "Verifier shell for the PaperEdge opportunity workflow.",
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
