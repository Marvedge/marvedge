import { Metadata } from "next";

export interface NavbarConfig {
  titleText: string;
  iconSRC: string;
  iconALT: string;
}

const pageMetadata: Record<string, { title: string; navbar: NavbarConfig }> = {
  analytics: {
    title: "Analytics",
    navbar: {
      titleText: "Analytics",
      iconSRC: "/majesticons_analytics.png",
      iconALT: "analytics_icon",
    },
  },
  dashboard: {
    title: "Dashboard",
    navbar: {
      titleText: "Dashboard",
      iconSRC: "/icons/Vector (1).svg",
      iconALT: "dashboard_icon",
    },
  },
  demos: {
    title: "Demos",
    navbar: {
      titleText: "My Demos",
      iconSRC: "/Group.png",
      iconALT: "my_demos_icon",
    },
  },
  "exported-videos": {
    title: "Shared Videos",
    navbar: {
      titleText: "Shared Videos",
      iconSRC: "/Group.png",
      iconALT: "exported_videos_icon",
    },
  },
  editor: {
    title: "Editor",
    navbar: {
      titleText: "Editor",
      iconSRC: "",
      iconALT: "",
    },
  },
  recorder: {
    title: "Recorder",
    navbar: {
      titleText: "Recorder",
      iconSRC: "",
      iconALT: "",
    },
  },
  settings: {
    title: "Settings",
    navbar: {
      titleText: "Settings",
      iconSRC: "/uil_setting.png",
      iconALT: "settings_icon",
    },
  },
  team: {
    title: "Team",
    navbar: {
      titleText: "Team",
      iconSRC: "/icons/Vector (1).svg",
      iconALT: "team_icon",
    },
  },
  templates: {
    title: "Templates",
    navbar: {
      titleText: "Templates",
      iconSRC: "/dashboard.png",
      iconALT: "templates_icon",
    },
  },
};

export function getPageMetadata(key: string): Metadata {
  const metadata = pageMetadata[key];
  const title = metadata?.title || key;
  return {
    title: key === "home" ? "Marvedge" : `${title} - Marvedge`,
    icons: {
      icon: "/icons/Transparent logo.png",
    },
  };
}

export function getNavbarConfig(pathname: string): NavbarConfig | null {
  if (pathname.startsWith("/recorder") || pathname.startsWith("/editor")) {
    return null;
  }

  for (const [key, data] of Object.entries(pageMetadata)) {
    if (pathname.startsWith(`/${key}`)) {
      return data.navbar;
    }
  }

  return null;
}
