import { createFileRoute } from "@tanstack/react-router";
import { BrandPage } from "@/components/workspace/account-pages";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/_authenticated/brand-kit")({
  head: () => pageHead("Brand Kit", "Preview and manage reusable Marvedge brand styles."),
  component: BrandPage,
});
