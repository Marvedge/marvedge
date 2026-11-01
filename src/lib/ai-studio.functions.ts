import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const AI_TOOLS = {
  plan: "You are a product demo producer. Turn the idea into a storyboard. Each item is one scene: title = scene name, text = narration / on-screen line, start and duration in seconds so scenes follow each other.",
  script: "Write a voiceover script for a product demo. Each item is one short narration line (max ~15 words): title = short label, text = the line, start and duration in seconds, back to back.",
  captions: "Write timed captions for the described video. Each item: text max 42 characters, title = empty string, start and duration in seconds, back to back.",
  translate: "Translate every provided text item into the target language, keeping tone and meaning. Return one item per provided item with the same ref, title empty, start 0, duration 0.",
  repurpose: "Suggest 3-5 short social clips from the described long recording. Each item: title = clip title, text = hook + caption, start = clip start in seconds, duration = clip length in seconds (15-60).",
  personalise: "Rewrite every provided text item for the given prospect (company, role, industry), keeping length similar. Return one item per provided item with the same ref, title empty, start 0, duration 0. Put a tailored end-of-demo button label (max 4 words) in summary.",
  agent: "You are Marvedge's AI agent for creating product demos and videos. Give practical, concise, step-by-step help. Use plain text with simple lists.",
} as const;
export type AiTool = keyof typeof AI_TOOLS;
export type AiItem = { ref: string; title: string; text: string; start: number; duration: number };
export type AiResult = { text: string; summary: string; items: AiItem[] };

const Input = z.object({
  tool: z.enum(Object.keys(AI_TOOLS) as [AiTool, ...AiTool[]]),
  prompt: z.string().trim().max(4000).default(""),
  options: z.record(z.string(), z.string().max(200)).default({}),
  context: z.array(z.object({ id: z.string().max(100), text: z.string().max(1000) })).max(200).default([]),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(8000) })).max(30).default([]),
});

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "items"],
  properties: {
    summary: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "title", "text", "start", "duration"],
        properties: { ref: { type: "string" }, title: { type: "string" }, text: { type: "string" }, start: { type: "number" }, duration: { type: "number" } },
      },
    },
  },
};
const Output = z.object({
  summary: z.string(),
  items: z.array(z.object({ ref: z.string(), title: z.string(), text: z.string(), start: z.number(), duration: z.number() })),
});

export const runAiTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<AiResult> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured.");
    const needsContext = data.tool === "translate" || data.tool === "personalise";
    if (needsContext && !data.context.length) throw new Error("This project has no text yet to work on. Add captions or steps first.");
    if (!needsContext && data.prompt.length < 3) throw new Error("Add a short description first.");
    const opts = Object.entries(data.options).map(([k, v]) => `${k}: ${v}`).join("\n");
    const ctx = data.context.length ? `\n\nProject text items (ref: text):\n${data.context.map((c) => `${c.id}: ${c.text}`).join("\n")}` : "";
    const userText = `${data.prompt}${opts ? `\n\nSettings:\n${opts}` : ""}${ctx}`;
    const agent = data.tool === "agent";
    const input = agent
      ? [...data.history.map((m) => ({ role: m.role, content: m.text })), { role: "user", content: userText }]
      : userText;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        instructions: agent ? AI_TOOLS.agent : `${AI_TOOLS[data.tool]} Use ref "" for new items. summary = one sentence describing the result.`,
        input,
        ...(agent ? {} : { text: { format: { type: "json_schema", name: "ai_result", strict: true, schema } } }),
      }),
    });
    if (res.status === 429) throw new Error("Too many requests right now — please wait a moment and try again.");
    if (res.status === 402) throw new Error("AI credits have run out. Add credits in your workspace to keep generating.");
    if (res.status === 403) throw new Error("AI isn't available for this workspace right now.");
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
    text = text.trim();
    if (!text) throw new Error("The AI didn't return a result. Try again with a different description.");
    if (agent) return { text, summary: "", items: [] };
    try {
      const out = Output.parse(JSON.parse(text));
      const items = out.items.map((i) => ({ ...i, start: Math.max(0, i.start), duration: Math.max(0, i.duration) }));
      const readable = items.map((i) => `${i.duration ? `[${i.start.toFixed(1)}s +${i.duration.toFixed(1)}s] ` : ""}${i.title ? `${i.title}: ` : ""}${i.text}`).join("\n");
      return { text: `${out.summary}\n\n${readable}`.trim(), summary: out.summary, items };
    } catch {
      console.error("AI returned invalid JSON", text.slice(0, 500));
      throw new Error("The AI result couldn't be read. Please try again.");
    }
  });
