"use client";

import { SessionProvider } from "next-auth/react";
import TopLoader from "./components/TopLoader";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      refetchInterval={5 * 60} // Refetch session every 5 minutes
      refetchOnWindowFocus={true}
      refetchOnReconnect={true}
    >
      <TopLoader />
      {children}
    </SessionProvider>
  );
}
