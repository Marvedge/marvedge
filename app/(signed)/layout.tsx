"use client";
import React, { ReactNode } from "react";
import SidemenuDashboard from "../components/SidemenuDashboard";
import { usePathname } from "next/navigation";

const SignedLayout = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const isRecorderOrEditor =
    pathname.startsWith("/recorder") || pathname.startsWith("/editor");
  return (
    <div className="flex min-h-screen">
      {!isRecorderOrEditor && <SidemenuDashboard />}
      <main
        className={`flex-1 bg-[#F1ECFF] pt-16 md:pt-0 ${
          !isRecorderOrEditor ? "md:ml-64" : ""
        }`}
      >
        {children}
      </main>
    </div>
  );
};

export default SignedLayout;
