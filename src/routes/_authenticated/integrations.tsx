import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsPage } from "@/components/workspace/account-pages";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/_authenticated/integrations")({
  head: () =>
    pageHead("Integrations", "Explore planned CRM, scheduling, analytics and storage connections."),
  component: IntegrationsPage,
});
