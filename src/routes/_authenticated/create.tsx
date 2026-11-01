import { createFileRoute } from "@tanstack/react-router";
import { CreatePage } from "@/components/workspace/create";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/_authenticated/create")({
  validateSearch: (search: Record<string, unknown>): { type?: string } => ({
    type: search["type"] === "video" ? "video" : "demo",
  }),
  head: () =>
    pageHead("Create", "Start an interactive demo or short-form video draft in Marvedge."),
  component: CreateRoute,
});
function CreateRoute() {
  const { type } = Route.useSearch();
  return <CreatePage initialType={type ?? "demo"} />;
}
