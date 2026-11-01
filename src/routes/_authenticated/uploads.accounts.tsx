import { createFileRoute } from "@tanstack/react-router";
import { UploadAccountsPage } from "@/components/workspace/upload-management";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/_authenticated/uploads/accounts")({
  head: () =>
    pageHead(
      "Upload accounts & credentials",
      "Manage social account and API credential setup profiles for Marvedge publishing.",
    ),
  component: UploadAccountsPage,
});
