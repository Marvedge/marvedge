import { getPageMetadata } from "@/app/lib/metadata";
import AnalyticsClient from "./AnalyticsClient";

export const metadata = getPageMetadata("analytics");

export default function Page() {
  return <AnalyticsClient />;
}
