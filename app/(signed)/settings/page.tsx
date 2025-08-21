import { getPageMetadata } from "@/app/lib/metadata";
import SettingsClient from "./SettingsClient";

export const metadata = getPageMetadata("settings");

export default function Page() {
  return <SettingsClient />;
}
