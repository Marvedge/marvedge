"use client";
import React, { ReactElement } from "react";
import SidemenuDashboard from "../components/SidemenuDashboard";

const SignedLayout = ({ children }: { children: ReactElement }) => {
  return (
    <div className="flex min-h-screen">
      <SidemenuDashboard />
      <main className="flex-1 bg-[#F1ECFF] md:ml-64 pt-16 md:pt-0">{children}</main>
    </div>
  );
};

export default SignedLayout;
