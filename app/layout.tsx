import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LocalShare - P2P File Sharing",
  description: "Share files instantly with devices on your network",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark">
      <body className="min-h-screen bg-gradient-to-b from-zinc-900 to-black antialiased">
        {children}
      </body>
    </html>
  );
}