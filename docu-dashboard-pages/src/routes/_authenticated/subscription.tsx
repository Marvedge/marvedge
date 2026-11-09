import { createFileRoute } from "@tanstack/react-router";
import { SubscriptionPage } from "@/components/workspace/account-pages";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/_authenticated/subscription")({
  head: () =>
    pageHead("Subscription", "Review plan availability, usage tracking and billing status."),
  component: SubscriptionPage,
});
