import { createFileRoute } from "@tanstack/react-router";
import { CreatePage, type CreateTab } from "@/components/workspace/create";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/_authenticated/create")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { type?: string; method?: string | undefined; tab?: CreateTab | undefined } => ({
    type: search["type"] === "video" ? "video" : "demo",
    method: ["url", "prompt", "upload"].includes(String(search["method"]))
      ? String(search["method"])
      : undefined,
    tab: search["tab"] === "uploads" || search["tab"] === "accounts" ? search["tab"] : undefined,
  }),
  head: () =>
    pageHead("Create", "Start a demo or video, upload media and plan publishing in Marvedge."),
  component: CreateRoute,
});
function CreateRoute() {
  const { type, method, tab } = Route.useSearch();
  return <CreatePage initialType={type ?? "demo"} initialMethod={method} tab={tab ?? "new"} />;
}
