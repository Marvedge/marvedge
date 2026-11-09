import { createFileRoute } from "@tanstack/react-router";
import { SharePage } from "@/components/workspace/share";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/_authenticated/share")({
  head: () => pageHead("Share & Hub", "Share links, embeds, lead forms, demo hubs and team collaboration in Marvedge."),
  component: SharePage,
});
