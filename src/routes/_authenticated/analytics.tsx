import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsPage } from "@/components/workspace/account-pages";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/_authenticated/analytics")({
  head: () =>
    pageHead("Analytics", "Explore engagement and conversion reporting for Marvedge experiences."),
  component: AnalyticsPage,
});
