import { getPageMetadata } from "@/app/lib/metadata";
import RecorderClient from "./RecorderClient";

export const metadata = getPageMetadata("recorder");

export default function Page() {
  return <RecorderClient />;
}