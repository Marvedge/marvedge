import { getPageMetadata } from "@/app/lib/metadata";
import ExportedVideosClient from "./ExportedVideosClient";

export const metadata = getPageMetadata("exported-videos");

export default async function Page() {
  return <ExportedVideosClient />;
}
