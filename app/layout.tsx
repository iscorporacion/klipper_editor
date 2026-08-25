import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Klipper Editor",
  description: "Local editor for Klipper configuration files",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <meta name="theme-color" content="#2196f3" />
      </head>
      <body>{children}</body>
    </html>
  );
}
