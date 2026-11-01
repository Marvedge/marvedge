import { createFileRoute } from "@tanstack/react-router";
import { EditorPage } from "@/components/workspace/editor";
import { DemoEditorPage } from "@/components/workspace/demo-editor";
import { pageHead, useWorkspace } from "@/lib/workspace";
export const Route = createFileRoute("/_authenticated/editor/$projectId")({
  head: () =>
    pageHead(
      "Project editor",
      "Edit guided demo steps or video scenes and preview your Marvedge project.",
    ),
  component: EditorRoute,
});
function EditorRoute() {
  const { projectId } = Route.useParams();
  const { projects } = useWorkspace();
  const type = projects.find((p) => p.id === projectId)?.type;
  return type === "demo"
    ? <DemoEditorPage key={projectId} projectId={projectId} />
    : <EditorPage key={projectId} projectId={projectId} />;
}
