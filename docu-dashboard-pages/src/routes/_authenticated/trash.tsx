import { createFileRoute } from "@tanstack/react-router";
import { TrashPage } from "@/components/workspace/trash";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/_authenticated/trash")({
  head: () => pageHead("Trash", "Restore deleted Marvedge projects, upload posts, and local media or clear your session trash."),
  component: TrashPage,
});