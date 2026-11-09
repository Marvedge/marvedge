import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/components/workspace/home";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/_authenticated/home")({
  head: () => pageHead("Home", "Your Marvedge workspace, recent projects and creative drafts."),
  component: HomePage,
});