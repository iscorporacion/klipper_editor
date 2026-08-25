import type { Metadata } from "next";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const faviconPath = `${basePath}/favicon.png`;

export const metadata: Metadata = {
  title: "Klipper Editor",
  description: "Local editor for Klipper configuration files",
  icons: {
    icon: faviconPath,
    shortcut: faviconPath,
    apple: faviconPath
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href={faviconPath} type="image/png" />
        <link rel="apple-touch-icon" href={faviconPath} />
        <meta name="theme-color" content="#2196f3" />
      </head>
      <body>{children}</body>
    </html>
  );
}
