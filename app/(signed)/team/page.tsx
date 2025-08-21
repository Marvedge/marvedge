import { getPageMetadata } from "@/app/lib/metadata";
import TeamClient from "./TeamClient";

export const metadata = getPageMetadata("team");

export default function Page() {
  return <TeamClient />;
}
