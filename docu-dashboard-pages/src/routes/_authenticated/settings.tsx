import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/workspace/account-pages";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/_authenticated/settings")({
  head: () => pageHead("Settings", "Manage your Marvedge profile and workspace preferences."),
  component: SettingsPage,
});
