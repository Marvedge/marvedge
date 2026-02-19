import { getPageMetadata } from "@/app/lib/metadata";
import DemosClient from "./DemosClient";

export const metadata = getPageMetadata("demos");

export default async function Page() {
  return <DemosClient />;
}
