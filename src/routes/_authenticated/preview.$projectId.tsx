import { createFileRoute } from "@tanstack/react-router";
import { PreviewPage } from "@/components/workspace/delivery-workflow";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/_authenticated/preview/$projectId")({
  head: () =>
    pageHead("Audience preview", "Review your demo and test interactions before delivery."),
  component: Page,
});
function Page() {
  const { projectId } = Route.useParams();
  return <PreviewPage projectId={projectId} />;
}
