import { getPageMetadata } from "@/app/lib/metadata";
import DashboardClient from "./DashboardClient";

export const metadata = getPageMetadata("dashboard");

export default function Page() {
  return <DashboardClient />;
}
