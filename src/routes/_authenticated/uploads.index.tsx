import { createFileRoute } from "@tanstack/react-router";
import { UploadManagementPage } from "@/components/workspace/upload-management";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/_authenticated/uploads/")({
  head: () =>
    pageHead(
      "Upload management",
      "Plan social content, manage media uploads, and organize your Marvedge publishing queue.",
    ),
  component: UploadManagementPage,
});
