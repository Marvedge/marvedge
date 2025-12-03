"use client";
import React, { ReactNode } from "react";
import SidemenuDashboard from "../components/SidemenuDashboard";
import SignedHeader from "../components/SignedHeader";
import { usePathname } from "next/navigation";
import { getNavbarConfig } from "@/app/lib/metadata";

const SignedLayoutClient = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const isRecorderOrEditor = pathname.startsWith("/recorder") || pathname.startsWith("/editor");
  const navbarConfig = getNavbarConfig(pathname);

  console.log("Current pathname:", pathname);
  console.log("Navbar config:", navbarConfig);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {navbarConfig && (
        <SignedHeader
          titleText={navbarConfig.titleText}
          iconSRC={navbarConfig.iconSRC}
          iconALT={navbarConfig.iconALT}
        />
      )}
      <div className="flex flex-1 overflow-hidden">
        {!isRecorderOrEditor && <SidemenuDashboard />}
        <main
          className={`flex-1 bg-[#F1ECFF] overflow-y-auto ${!isRecorderOrEditor ? "md:ml-72 sm:ml-64" : ""}`}
          style={{ height: "100%" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
};

export default SignedLayoutClient;
