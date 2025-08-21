"use client";
import { SessionProvider } from "next-auth/react";
import "./globals.css";
import { SonnerToaster } from "./components/sonner-toaster";
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="overflow-x-hidden">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="overflow-x-hidden">
        <SessionProvider>{children}</SessionProvider>

        <SonnerToaster />
      </body>
    </html>
  );
}
