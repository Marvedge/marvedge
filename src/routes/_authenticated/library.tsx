import { createFileRoute } from "@tanstack/react-router";
import { LibraryPage } from "@/components/workspace/library";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/_authenticated/library")({
  head: () => pageHead("Library", "Reusable media, recordings and starter templates for your Marvedge projects."),
  component: LibraryPage,
});
