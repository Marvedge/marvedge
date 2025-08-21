"use client";

import { SessionProvider } from "next-auth/react";
import TopLoader from "./components/TopLoader";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TopLoader />
      {children}
    </SessionProvider>
  );
}
