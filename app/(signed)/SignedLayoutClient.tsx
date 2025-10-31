"use client";
import React, { ReactNode } from "react";
import SidemenuDashboard from "../components/SidemenuDashboard";
import { usePathname } from "next/navigation";

const SignedLayoutClient = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const isRecorderOrEditor =
    pathname.startsWith("/recorder") || pathname.startsWith("/editor");

  return (
    <div className="flex h-screen overflow-hidden">
      {!isRecorderOrEditor && <SidemenuDashboard />}
      <main
        className={`flex-1 bg-[#F1ECFF] pt-16 md:pt-0 overflow-y-auto ${!isRecorderOrEditor ? "md:ml-64" : ""}`}
        style={{ height: "100vh" }}
      >
        {children}
      </main>
    </div>
  );
};

export default SignedLayoutClient;
