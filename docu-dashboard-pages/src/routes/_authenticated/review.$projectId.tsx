import { createFileRoute } from "@tanstack/react-router";
import { ReviewPage } from "@/components/workspace/delivery-workflow";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/_authenticated/review/$projectId")({
  head: () =>
    pageHead(
      "Source review",
      "Review your recording, permissions and project details before editing.",
    ),
  component: Page,
});
function Page() {
  const { projectId } = Route.useParams();
  return <ReviewPage projectId={projectId} />;
}
