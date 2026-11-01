import { createFileRoute } from "@tanstack/react-router";
import { CreatePage } from "@/components/workspace/create";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/_authenticated/create")({
  validateSearch: (search: Record<string, unknown>): { type?: string; method?: string | undefined } => ({
    type: search["type"] === "video" ? "video" : "demo",
    method: ["url", "prompt", "upload"].includes(String(search["method"]))
      ? String(search["method"])
      : undefined,
  }),
  head: () =>
    pageHead("Create", "Start an interactive demo or short-form video draft in Marvedge."),
  component: CreateRoute,
});
function CreateRoute() {
  const { type, method } = Route.useSearch();
  return <CreatePage initialType={type ?? "demo"} initialMethod={method} />;
}
