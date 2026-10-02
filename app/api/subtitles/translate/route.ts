import { after, NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import OpenAI from "openai";

import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import {
  TRANSLATION_SYSTEM_PROMPT,
  applyTranslations,
  buildTranslationBatches,
  buildTranslationPrompt,
  isSubtitleTranslateAllowed,
  isSubtitleTranslateEnabled,
  isTranslationTarget,
  languageLabel,
  normalizeCues,
  parseTranslationBatch,
  readCueList,
  toTranslationSegments,
} from "@/app/lib/subtitles";
import { DEFAULT_SUBTITLE_STYLE } from "@/app/lib/subtitles/style";
import type { SubtitleCue } from "@/app/lib/subtitles";

/**
 * POST /api/subtitles/translate — translate one of a demo's subtitle tracks into
 * another language (PRD §6.7 / US-4).
 *
 * WHY THIS IS ASYNC. A 10-minute demo is roughly 150 cues, which is four OpenAI
 * round trips at the library's batch size; a 30-minute one is a dozen. Actual
 * per-request latency was NOT measured while writing this (no key was available
 * to spend), so the choice was made on the safe side: this follows the same
 * `after()` + job-record + client-polling shape as
 * app/api/subtitles/create/route.ts, which means a slow model or a long video
 * degrades into a longer poll rather than a request that dies at the serverless
 * limit with a half-written track. The client already has the poll loop.
 *
 * The job is recorded with `kind: "SUBTITLES"` so GET /api/jobs/{id} returns its
 * cues through the branch that already exists — no change to that route.
 */

// Same ceiling the generation route uses; `after()` work is billed against it.
export const maxDuration = 300;

// gpt-4o, matching app/api/avs/script/route.ts — the only OpenAI model this
// codebase already uses. No new vendor, no new key: OPENAI_API_KEY is the one
// AVS is configured with.
const MODEL = "gpt-4o";

const PROGRESS_QUEUED = 10;
const PROGRESS_TRANSLATING = 30;
const PROGRESS_PERSISTING = 85;
const PROGRESS_DONE = 100;

interface TranslateJobInput {
  jobId: string;
  demoId: string;
  cues: SubtitleCue[];
  sourceLanguage: string;
  targetLanguage: string;
  /** Track-level font size from the demo's subtitleStyle, used as the scaling base. */
  baseFontSizePct: number;
  /** Video duration for last-cue retiming ceiling. */
  videoDurationSeconds?: number;
}

/**
 * Translate every batch and write the resulting track. Runs from `after()`, so
 * nothing it throws can reach the client — every exit path has to land in the
 * job record instead.
 */
async function dispatchTranslateJob({
  jobId,
  demoId,
  cues,
  sourceLanguage,
  targetLanguage,
  baseFontSizePct,
  videoDurationSeconds,
}: TranslateJobInput) {
  try {
    await prisma.videoJob.update({
      where: { id: jobId },
      data: { status: "PROCESSING", progress: PROGRESS_TRANSLATING },
    });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const sourceLabel = languageLabel(sourceLanguage);
    const targetLabel = languageLabel(targetLanguage);

    const batches = buildTranslationBatches(cues);
    const translated: string[] = [];

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      const completion = await openai.chat.completions.create({
        model: MODEL,
        // Low temperature: this is a faithfulness task, not a creative one.
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: TRANSLATION_SYSTEM_PROMPT },
          {
            role: "user",
            content: buildTranslationPrompt(toTranslationSegments(batch), sourceLabel, targetLabel),
          },
        ],
      });

      // Throws TranslationAlignmentError unless the response carries exactly the
      // indices it was given. Deliberately NOT tolerant: a batch that comes back
      // one line short would shift every subtitle after it against the audio for
      // the rest of the video, and that is invisible until someone watches to
      // the end. See the header comment in app/lib/subtitles/translate.ts.
      const content = completion.choices[0]?.message?.content ?? "";
      translated.push(...parseTranslationBatch(content, batch.length));

      await prisma.videoJob
        .update({
          where: { id: jobId },
          data: {
            progress:
              PROGRESS_TRANSLATING +
              Math.round(((b + 1) / batches.length) * (PROGRESS_PERSISTING - PROGRESS_TRANSLATING)),
          },
        })
        .catch(() => {});
    }

    // Timings are copied from the source cues verbatim; the model never sees or
    // returns a timestamp. Task-00061: `localize: true` additionally retimes
    // character-dense cues into silence gaps and attaches per-cue fontSizePct
    // overrides for cues whose translated text is significantly longer than the
    // source. normalizeCues is the same last-mile guarantee the generation route
    // applies (sorted, non-overlapping) for the render worker.
    const translatedCues = normalizeCues(
      applyTranslations(cues, translated, {
        localize: true,
        baseFontSizePct,
        videoDurationSeconds,
      })
    );

    await prisma.subtitleTrack.upsert({
      where: { demoId_language: { demoId, language: targetLanguage } },
      create: {
        demoId,
        language: targetLanguage,
        status: "READY",
        source: "translation",
        cues: translatedCues,
      },
      update: { status: "READY", source: "translation", cues: translatedCues },
    });

    await prisma.videoJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        progress: PROGRESS_DONE,
        jobData: {
          kind: "SUBTITLES",
          provider: "openai",
          mode: "translation",
          language: targetLanguage,
          sourceLanguage,
          subtitles: translatedCues,
        },
      },
    });
  } catch (err) {
    console.error("Subtitle Translate Dispatch Error:", err);
    await prisma.videoJob
      .update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          error: err instanceof Error ? err.message : "Subtitle translation failed",
        },
      })
      .catch(() => {});
  }
}

export async function POST(req: NextRequest) {
  // Flag off → behave as if the route does not exist, like the AVS routes. This
  // defaults OFF, so an environment that has not opted in spends nothing at
  // OpenAI and exposes no new surface.
  if (!isSubtitleTranslateEnabled()) {
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
    select: { id: true, plan: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // THE ONLY PLAN GATE IN THIS FEATURE. Read from the database on every call —
  // never from the session, never from the request body. Generation, editing,
  // styling and file export stay free for every plan, including anonymous.
  if (!isSubtitleTranslateAllowed(user.plan)) {
    return NextResponse.json(
      {
        error:
          "Subtitle translation is available on the PRO and ENTERPRISE plans. " +
          "Generating, editing and styling subtitles stay free on your current plan.",
      },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const demoId = typeof body.demoId === "string" ? body.demoId : "";
  const sourceLanguage = typeof body.sourceLanguage === "string" ? body.sourceLanguage : "";
  const targetLanguage = typeof body.targetLanguage === "string" ? body.targetLanguage : "";

  if (!demoId) {
    return NextResponse.json(
      { error: "Save this demo before translating its subtitles." },
      { status: 400 }
    );
  }

  // The target has to be a language we can both translate into AND display —
  // `isTranslationTarget` covers both, and excludes auto-detect, which is not a
  // language you can translate into.
  if (!isTranslationTarget(targetLanguage)) {
    return NextResponse.json(
      { error: "Unsupported target language for translation." },
      { status: 400 }
    );
  }

  if (sourceLanguage === targetLanguage) {
    return NextResponse.json(
      { error: "The source and target languages are the same." },
      { status: 400 }
    );
  }

  const demo = await prisma.demo.findUnique({
    where: { id: demoId },
    select: { id: true, userId: true, subtitles: true, editing: true },
  });
  if (!demo || demo.userId !== user.id) {
    return NextResponse.json({ error: "Demo not found" }, { status: 404 });
  }

  // Prefer the requested source track. Fall back to Demo.subtitles — the working
  // copy every demo has — so a demo generated before the track table existed can
  // still be translated.
  const sourceTrack = await prisma.subtitleTrack
    .findUnique({
      where: { demoId_language: { demoId, language: sourceLanguage } },
      select: { cues: true },
    })
    .catch(() => null);

  const cues = normalizeCues(
    readCueList(sourceTrack?.cues ?? demo.subtitles) as unknown as SubtitleCue[]
  );

  if (cues.length === 0) {
    return NextResponse.json(
      { error: "There are no subtitles to translate yet. Generate them first." },
      { status: 400 }
    );
  }

  const jobRecord = await prisma.videoJob.create({
    data: {
      userId: user.id,
      demoId,
      // Translation reads cues, not video, but the column is required and the
      // demo's source is the honest value for a job attached to this demo.
      videoUrl: "",
      status: "PROCESSING",
      progress: PROGRESS_QUEUED,
      jobData: {
        kind: "SUBTITLES",
        mode: "translation",
        language: targetLanguage,
        sourceLanguage,
      },
    },
  });

  // Read the demo's subtitle style for the font scaling base. Falls back to
  // the default (5% of frame height) when the style has not been customised.
  const editing = demo.editing as Record<string, unknown> | null;
  const subtitleStyle = editing?.subtitleStyle as { fontSizePct?: number } | undefined;
  const baseFontSizePct = subtitleStyle?.fontSizePct ?? DEFAULT_SUBTITLE_STYLE.fontSizePct;

  after(() =>
    dispatchTranslateJob({
      jobId: jobRecord.id,
      demoId,
      cues,
      sourceLanguage,
      targetLanguage,
      baseFontSizePct,
    })
  );

  return NextResponse.json({
    success: true,
    status: "processing",
    jobId: jobRecord.id,
    sourceLanguage,
    targetLanguage,
    cueCount: cues.length,
  });
}
