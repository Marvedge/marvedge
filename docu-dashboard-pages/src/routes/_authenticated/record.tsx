import { createFileRoute } from "@tanstack/react-router";
import { RecordingPage } from "@/components/workspace/creation-workflow";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/_authenticated/record")({
  head: () =>
    pageHead(
      "Screen recording",
      "Capture your screen with local pause, stop, permission recovery and recording review.",
    ),
  component: Page,
});
function Page() {
  return <RecordingPage />;
}
