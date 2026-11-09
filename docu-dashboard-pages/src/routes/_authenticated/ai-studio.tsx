import { createFileRoute } from "@tanstack/react-router";
import { AiStudioPage } from "@/components/workspace/ai-studio";
import { pageHead } from "@/lib/workspace";
export const Route = createFileRoute("/_authenticated/ai-studio")({
  head: () => pageHead("AI Studio", "Preview Marvedge's planned AI tools: scripts, captions, smart edits, translation, voiceover and assistant."),
  component: AiStudioPage,
});
