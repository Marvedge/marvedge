import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import OpenAI from "openai";

import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import { isAvsEnabled } from "@/app/lib/avs/flags";
import { isAvsAllowed } from "@/app/lib/avs/access";
import { isScriptTone, toneGuidance, type ScriptTone } from "@/app/lib/avs/tones";
import type { ScriptLine } from "@/app/types/avs";

// OpenAI rewrite can take a few seconds for many steps; allow headroom.
export const maxDuration = 60;

// gpt-4o for rewrite quality (see AVS plan §7 / nit #5).
const MODEL = "gpt-4o";

const SYSTEM_PROMPT =
  "You are an expert scriptwriter for software product demo voiceovers. You rewrite " +
  "narration in a requested tone. Rules: always keep the text in English and never " +
  "translate it; keep each segment concise and natural for a spoken voiceover; preserve " +
  "the original meaning and the exact number of segments; never merge, split, reorder, or " +
  "drop segments; do not add commentary, labels, headings, or markdown. Respond with " +
  "strict JSON only.";

interface LineInput {
  stepId: string;
  text: string;
}

/** Read + sanitize the `lines` body field into non-empty {stepId,text} entries. */
function parseLines(value: unknown): LineInput[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const lines: LineInput[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const rec = entry as Record<string, unknown>;
    const stepId = typeof rec.stepId === "string" ? rec.stepId : "";
    const text = typeof rec.text === "string" ? rec.text.trim() : "";
    if (stepId && text) {
      lines.push({ stepId, text });
    }
  }
  return lines;
}

/** Rewrite a batch of per-step narration lines, preserving order and stepIds. */
async function rewriteLines(
  openai: OpenAI,
  lines: LineInput[],
  tone: ScriptTone
): Promise<{ lines: ScriptLine[]; rewritten: boolean }> {
  // Key segments by index (not stepId) so the model can't mangle ids; we map the
  // rewritten text back onto the original stepIds ourselves.
  const segments = lines.map((line, i) => ({ i, text: line.text }));

  const instructions =
    'Rewrite the "text" of every segment below in that tone. Return JSON of the exact form ' +
    '{"segments":[{"i":<same index>,"text":<rewritten text>}]}, with one entry for every input ' +
    "index and nothing else.";
  const userPrompt = `Tone: ${tone}\nTone guidance: ${toneGuidance(tone)}\n\n${instructions}\n\n${JSON.stringify(
    { segments }
  )}`;

  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  const rewritten = new Map<number, string>();
  try {
    const parsed = JSON.parse(content) as { segments?: unknown };
    if (Array.isArray(parsed.segments)) {
      for (const seg of parsed.segments) {
        if (typeof seg !== "object" || seg === null) {
          continue;
        }
        const rec = seg as Record<string, unknown>;
        const i = Number(rec.i);
        const text = typeof rec.text === "string" ? rec.text.trim() : "";
        if (Number.isInteger(i) && text) {
          rewritten.set(i, text);
        }
      }
    }
  } catch {
    // Malformed JSON → fall back to the original text for every line below.
  }

  // Always return a line per input, falling back to the original text if the
  // model omitted or blanked a segment.
  // Fallback keeps original text in same order and count so no step is lost.
  const resultLines = lines.map((line, i) => ({
    stepId: line.stepId,
    text: rewritten.get(i) ?? line.text,
  }));
  const rewrittenOk = lines.every((_, i) => rewritten.has(i));
  return { lines: resultLines, rewritten: rewrittenOk };
}

/** Rewrite a single free-form script blob (the no-steps fallback). */
async function rewriteRaw(
  openai: OpenAI,
  raw: string,
  tone: ScriptTone
): Promise<{ text: string; rewritten: boolean }> {
  const instructions =
    "Rewrite the following demo narration in that tone. Return JSON of the exact form " +
    '{"text":<rewritten text>} and nothing else.';
  const userPrompt = `Tone: ${tone}\nTone guidance: ${toneGuidance(tone)}\n\n${instructions}\n\n${JSON.stringify(
    { text: raw }
  )}`;

  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(content) as { text?: unknown };
    if (typeof parsed.text === "string" && parsed.text.trim()) {
      return { text: parsed.text.trim(), rewritten: true };
    }
  } catch {
    // fall through to the original text
  }
  // Fallback returns original raw text so callers keep usable content.
  return { text: raw, rewritten: false };
}

export async function POST(req: NextRequest) {
  // Flag off → the feature is invisible; behave as if the route doesn't exist.
  if (!isAvsEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        session.user.id ? { id: session.user.id as string } : undefined,
        session.user.email ? { email: session.user.email } : undefined,
      ].filter(Boolean) as Array<{ id?: string; email?: string }>,
    },
    select: { plan: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // PRO/ENTERPRISE only — mirrors the export path's plan gate.
  if (!isAvsAllowed(user.plan)) {
    return NextResponse.json(
      { error: "AVS is available on PRO and ENTERPRISE plans." },
      {
        status: 403,
      }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isScriptTone(body.tone)) {
    return NextResponse.json({ error: "Invalid or missing tone" }, { status: 400 });
  }
  const tone = body.tone;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Script rewrite is not configured" }, { status: 500 });
  }
  const openai = new OpenAI({ apiKey });

  try {
    // Per-step mode takes precedence when `lines` is present.
    const lines = parseLines(body.lines);
    if (lines !== null && Array.isArray(body.lines)) {
      if (lines.length === 0) {
        return NextResponse.json({ error: "No script text to rewrite" }, { status: 400 });
      }
      const { lines: result, rewritten } = await rewriteLines(openai, lines, tone);
      return NextResponse.json({ lines: result, tone, rewritten });
    }

    // Fallback: single free-form blob.
    if (typeof body.raw === "string") {
      const raw = body.raw.trim();
      if (!raw) {
        return NextResponse.json({ error: "No script text to rewrite" }, { status: 400 });
      }
      const { text: result, rewritten } = await rewriteRaw(openai, raw, tone);
      return NextResponse.json({ raw: result, tone, rewritten });
    }

    return NextResponse.json({ error: "Provide `lines` or `raw` to rewrite" }, { status: 400 });
  } catch (err) {
    console.error("AVS script rewrite failed:", err);
    return NextResponse.json({ error: "Failed to rewrite script" }, { status: 502 });
  }
}
