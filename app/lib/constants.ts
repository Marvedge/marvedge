// Store shared arrays and constants here

export const TABS = [
  "Profile",
  "Notification",
  "Privacy",
  "Preferences",
  "Account",
];

export const NOTIFICATION_SETTINGS = [
  {
    label: "Email Notification",
    desc: "Receive notification via mail.",
    key: "emailNotification",
    default: true,
  },
  {
    label: "Demo Shares",
    desc: "Receive notification when someone shares your demo.",
    key: "demoShares",
    default: true,
  },
  {
    label: "Team Invitations",
    desc: "Receive notification when you are invited to a team.",
    key: "teamInvitations",
    default: true,
  },
  {
    label: "Weekly Digest",
    desc: "Receive notification of the summary of your demo performance.",
    key: "weeklyDigest",
    default: false,
  },
  {
    label: "Marketing Email",
    desc: "Receive notification of the product updates and feature announcements.",
    key: "marketingEmail",
    default: false,
  },
  {
    label: "Security Alerts",
    desc: "Important security notification.",
    key: "securityAlerts",
    default: false,
  },
];

export const PRIVACY_SETTINGS = [
  {
    label: "Show email address",
    desc: "Display your email on public profile.",
    key: "showEmail",
    default: true,
  },
  {
    label: "Show Location",
    desc: "Display your location on public profile.",
    key: "showLocation",
    default: true,
  },
  {
    label: "Allow Demo Indexing",
    desc: "Let Search engines index your public demos.",
    key: "allowDemoIndexing",
    default: false,
  },
  {
    label: "Analytics and Usage Data",
    desc: "Help to improve Marvedge by sharing usage data.",
    key: "analyticsUsageData",
    default: false,
  },
];

export const PREFERENCES_SETTINGS = [
  {
    label: "Auto Save",
    desc: "Automatically save your work.",
    key: "autoSave",
    default: true,
  },
  {
    label: "Show Tutorials",
    desc: "Display helpful tips and tutorials.",
    key: "showTutorials",
    default: false,
  },
  {
    label: "Compact mode",
    desc: "Use smaller interface elements.",
    key: "compactMode",
    default: false,
  },
  {
    label: "Animations",
    desc: "Enable smooth transitions and animations.",
    key: "animations",
    default: false,
  },
];

export const sanitizeFilename = (title: string): string => {
  if (!title) return "recording";

  // Remove or replace invalid filename characters
  return title
    .replace(/[<>:"/\\|?*]/g, "") // Remove invalid characters
    .replace(/\s+/g, "_") // Replace spaces with underscores
    .replace(/[^\w\-_.]/g, "") // Keep only alphanumeric, hyphens, underscores, and dots
    .substring(0, 100) // Limit length
    .trim();
};
