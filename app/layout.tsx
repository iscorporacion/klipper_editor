import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RatOS File Viewer",
  description: "Local editor for RatOS and Klipper configuration files"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
