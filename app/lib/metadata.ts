import { Metadata } from "next";

const pageTitles: Record<string, string> = {
  analytics: "Analytics",
  dashboard: "Dashboard",
  demos: "Demos",
  editor: "Editor",
  recorder: "Recorder",
  settings: "Settings",
  team: "Team",
  templates: "Templates",
};

export function getPageMetadata(key: string): Metadata {
  const title = pageTitles[key] || key;
  return {
    title: key === "home" ? "Marvedge" : `${title} - Marvedge`,
    icons: {
      icon: "/icons/Transparent logo.png", 
    },
  };
}
