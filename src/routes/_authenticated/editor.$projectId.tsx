import { createFileRoute } from "@tanstack/react-router";
import { EditorPage } from "@/components/workspace/editor";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/_authenticated/editor/$projectId")({
  head: () =>
    pageHead(
      "Project editor",
      "Edit demo steps, video scenes, callouts, and preview your Marvedge project.",
    ),
  component: EditorRoute,
});
function EditorRoute() {
  const { projectId } = Route.useParams();
  return <EditorPage key={projectId} projectId={projectId} />;
}
