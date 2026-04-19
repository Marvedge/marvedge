"use client";
import { useSession } from "next-auth/react";
import DashboardMain from "@/app/components/DashboardMain";

export const metadata = {
  iconSRC: "/icons/Vector (1).svg",
  iconALT: "dashboard_icon",
};

interface DashboardClientProps {
  totalCount: number;
  initialDemos: {
    id: string;
    title: string;
    description: string | null;
    videoUrl: string;
    startTime?: string | null;
    endTime?: string | null;
    createdAt: string;
    updatedAt: string;
    editing?: any;
  }[];
  totalViews: number;
  activeShares: number;
}

const DashboardPage = ({
  totalCount,
  initialDemos,
  totalViews,
  activeShares,
}: DashboardClientProps) => {
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
        <DashboardMain
          totalCount={totalCount}
          initialDemos={initialDemos}
          totalViews={totalViews}
          activeShares={activeShares}
        />
      </div>
    </div>
  );
};

export default DashboardPage;
