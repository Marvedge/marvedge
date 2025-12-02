"use client";
import { useSession } from "next-auth/react";
import DashboardMain from "@/app/components/DashboardMain";

export const metadata = {
  iconSRC: "/icons/Vector (1).svg",
  iconALT: "dashboard_icon",
};
const DashboardPage = () => {
  const { status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }
  return (
    <div
      className="overflow-y-auto h-full"
      style={{
        fontFamily: "var(--font-raleway)",
      }}
    >
      <div className="flex flex-col gap-3 md:gap-4">
        <DashboardMain />
      </div>
    </div>
  );
};

export default DashboardPage;
