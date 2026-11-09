import { createFileRoute } from "@tanstack/react-router";
import { ProjectsPage } from "@/components/workspace/projects";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/_authenticated/projects")({
  head: () => pageHead("Projects", "Find and organize your interactive demos and video projects."),
  component: ProjectsPage,
});
