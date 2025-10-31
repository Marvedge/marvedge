"use client";
import { useSession } from "next-auth/react";
import SignedHeader from "@/app/components/SignedHeader";
import DashboardMain from "@/app/components/DashboardMain";

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
      style={{ minHeight: "calc(100vh - 80px)" }}
    >
      <div className="flex flex-col gap-3 md:gap-4">
        <SignedHeader
          titleText="Dashboard"
          iconSRC="/icons/Vector (1).svg"
          iconALT="dashboard_icon"
        />
        <DashboardMain />
      </div>
    </div>
  );
};

export default DashboardPage;
