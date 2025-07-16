"use client";
import React, { ReactNode } from "react";
import SidemenuDashboard from "../components/SidemenuDashboard";
import { usePathname } from "next/navigation";

const SignedLayout = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const isRecorder = pathname.startsWith("/recorder");
  return (
    <div className="flex min-h-screen">
      {!isRecorder && <SidemenuDashboard />}
      <main
        className={`flex-1 bg-[#F1ECFF] pt-16 md:pt-0 ${
          !isRecorder ? "md:ml-64" : ""
        }`}
      >
        {children}
      </main>
    </div>
  );
};

export default SignedLayout;
