import { createFileRoute } from "@tanstack/react-router";
import { ExportPage } from "@/components/workspace/delivery-workflow";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/_authenticated/export/$projectId")({
  head: () =>
    pageHead(
      "Export and sharing",
      "Preview video speed and download Marvedge draft settings, timed captions and original recordings.",
    ),
  component: Page,
});
function Page() {
  const { projectId } = Route.useParams();
  return <ExportPage projectId={projectId} />;
}
