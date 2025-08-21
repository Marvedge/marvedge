"use client";
import { SessionProvider } from "next-auth/react";
import "./globals.css";
import { SonnerToaster } from "./components/sonner-toaster";
import TopLoader from "./components/TopLoader";
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
        <SessionProvider>
          <TopLoader />
          {children}
        </SessionProvider>

        <SonnerToaster />
      </body>
    </html>
  );
}
