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
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured.");
    const opts = Object.entries(data.options).map(([k, v]) => `${k}: ${v}`).join("\n");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        instructions: `${AI_TOOLS[data.tool]} Use plain text with simple headings and lists. No preamble.`,
        input: `${data.prompt}${opts ? `\n\nSettings:\n${opts}` : ""}`,
      }),
    });
    if (res.status === 429) throw new Error("Too many requests right now — please wait a moment and try again.");
    if (res.status === 402) throw new Error("AI credits have run out. Add credits in your workspace to keep generating.");
    if (!res.ok || !res.body) {
      const body = await res.text();
      console.error(`AI request failed [${res.status}]: ${body}`);
      throw new Error(`AI request failed (${res.status}).`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const evt = JSON.parse(payload) as { type?: string; delta?: string };
          if (evt.type === "response.output_text.delta" && evt.delta) text += evt.delta;
          if (evt.type === "error" || evt.type === "response.failed") throw new Error("AI generation failed.");
        } catch (e) {
          if (e instanceof Error && e.message === "AI generation failed.") throw e;
        }
      }
    }
    return { text: text.trim() || "No result was returned." };
  });
