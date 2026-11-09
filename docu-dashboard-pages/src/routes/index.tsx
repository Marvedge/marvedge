import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/public/landing";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/")({
  head: () =>
    pageHead("Marvedge — Interactive demos and video drafts", "Capture your product story, create interactive demos and video drafts, and plan your next creative project with Marvedge."),
  component: LandingPage,
});
