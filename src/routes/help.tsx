import { createFileRoute } from "@tanstack/react-router";
import { HelpPage } from "@/components/workspace/account-pages";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/help")({
  head: () =>
    pageHead("Help Center", "Get help with creating, editing and sharing Marvedge projects."),
  component: HelpPage,
});
