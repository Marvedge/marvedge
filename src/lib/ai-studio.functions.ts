import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const AI_TOOLS = {
  plan: "You are a product demo producer. Create a production plan and storyboard: goal, audience, numbered scenes with on-screen action, narration line and duration.",
  script: "Write a clear voiceover script for a product demo video, split into short timed lines (mm:ss).",
  captions: "Write timed captions (SRT-like, mm:ss) for the described video. Short lines, max 42 characters.",
  translate: "Translate the given script or captions into the target language, keeping timings and tone.",
  repurpose: "Turn the described long recording into 3-5 short social clips: title, hook, start-end suggestion, caption and platform.",
  personalise: "Personalise the demo for the given prospect: tailored intro, 3 key steps to highlight, CTA, and variables like {company} used.",
  agent: "You are Marvedge's AI agent for creating product demos and videos. Give practical, concise, step-by-step help.",
} as const;

const Input = z.object({
  tool: z.enum(Object.keys(AI_TOOLS) as [keyof typeof AI_TOOLS, ...(keyof typeof AI_TOOLS)[]]),
  prompt: z.string().trim().min(3).max(4000),
  options: z.record(z.string(), z.string().max(200)).default({}),
});

export const runAiTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured.");
    const opts = Object.entries(data.options).map(([k, v]) => `${k}: ${v}`).join("\n");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: `${AI_TOOLS[data.tool]} Use plain text with simple headings and lists. No preamble.` },
          { role: "user", content: `${data.prompt}${opts ? `\n\nSettings:\n${opts}` : ""}` },
        ],
      }),
    });
    if (res.status === 429) throw new Error("Too many requests right now — please wait a moment and try again.");
    if (res.status === 402) throw new Error("AI credits have run out. Add credits in your workspace to keep generating.");
    if (!res.ok) throw new Error(`AI request failed (${res.status}).`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { text: json.choices?.[0]?.message?.content?.trim() || "No result was returned." };
  });
