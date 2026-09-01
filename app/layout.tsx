import type { Metadata } from "next";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const faviconPath = `${basePath}/img/k-editor-mark.svg`;

export const metadata: Metadata = {
  title: "Klipper Editor",
  description: "Local editor for Klipper configuration files",
  icons: {
    icon: faviconPath,
    shortcut: faviconPath
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
        <link rel="icon" href={faviconPath} type="image/svg+xml" />
        <meta name="theme-color" content="#2196f3" />
      </head>
      <body>{children}</body>
    </html>
  );
}
