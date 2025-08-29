import { getPageMetadata } from "@/app/lib/metadata";
import TemplatesClient from "./TemplatesClient";

export const metadata = getPageMetadata("templates");

export default function Page() {
  return <TemplatesClient />;
}
