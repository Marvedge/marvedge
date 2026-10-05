import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@prisma/client";
import { validateCropTargetData } from "@/app/types/editor/crop-target";

/**
 * Worker webhook endpoint (Cloud Run video worker & reframe worker callbacks).
 *
 * Authenticated via Authorization: Bearer <CALLBACK_SECRET>.
 * Handles completion, progress, and failure for:
 *   - Video exports (existing behaviour)
 *   - Reframe saliency jobs (Task-00025)
 *   - AVS Dubbing jobs (Task-00059)
 */
export async function POST(req: NextRequest) {
  try {
    // ── Authenticate ──────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const expectedSecret = (process.env.CALLBACK_SECRET || "").trim();

    if (!expectedSecret || token !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Body ──────────────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
    }

    const {
      jobId,
      status,
      progress,
      exportedUrl,
      error,
      cropTargets,
      alignedVideoUrl,
      duration,
      fallback,
      fallbackStage,
      fallbackReason,
      attemptsMade,
    } = body as {
      jobId?: string;
      status?: string;
      progress?: unknown;
      exportedUrl?: string;
      error?: string;
      cropTargets?: unknown;
      alignedVideoUrl?: string;
      duration?: number;
      fallback?: boolean;
      fallbackStage?: string;
      fallbackReason?: string;
      attemptsMade?: number;
    };

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    const validStatuses = ["PROCESSING", "COMPLETED", "FAILED"];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // ── Fetch existing job ────────────────────────────────────────────
    const job = await prisma.videoJob.findUnique({
      where: { id: jobId },
      select: { id: true, demoId: true, jobData: true, status: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // ── Terminal-state protection (Task-00026) ─────────────────────────
    if (job.status === "COMPLETED" || job.status === "CANCELLED") {
      console.log(
        `[callback] Ignored callback for terminal job ${jobId} (current: ${job.status}, incoming: ${status})`
      );
      return NextResponse.json({
        success: true,
        ignored: true,
        message: `Job ${jobId} is already in terminal state: ${job.status}`,
      });
    }

    const existingJobData =
      job.jobData && typeof job.jobData === "object" && !Array.isArray(job.jobData)
        ? (job.jobData as Record<string, unknown>)
        : {};
    const isDubJob = existingJobData.kind === "AVS_DUB";
    const isReframeJob = existingJobData.kind === "REFRAME";

    // ── Reframe Job Handling ─────────────────────────────────────────
    if (cropTargets !== undefined || isReframeJob) {
      if (!isReframeJob) {
        return NextResponse.json({ error: "Job is not a REFRAME job" }, { status: 400 });
      }

      if (status === "PROCESSING") {
        if (
          progress === undefined ||
          progress === null ||
          typeof progress !== "number" ||
          Number.isNaN(progress) ||
          !Number.isFinite(progress) ||
          progress < 0 ||
          progress > 100
        ) {
          return NextResponse.json(
            { error: "Invalid progress: must be a number between 0 and 100" },
            { status: 400 }
          );
        }

        if (typeof prisma.videoJob.updateMany === "function") {
          const updateResult = await prisma.videoJob.updateMany({
            where: {
              id: jobId,
              status: {
                notIn: ["COMPLETED", "CANCELLED"],
              },
            },
            data: {
              status: "PROCESSING",
              progress: Math.round(progress),
            },
          });

          if (updateResult.count === 0) {
            console.log(
              `[callback] Ignored PROCESSING callback; job ${jobId} is already in terminal state.`
            );
            return NextResponse.json({
              success: true,
              ignored: true,
              message: `Job ${jobId} is already in a terminal state`,
            });
          }
        } else {
          await prisma.videoJob.update({
            where: { id: jobId },
            data: {
              status: "PROCESSING",
              progress: Math.round(progress),
            },
          });
        }

        console.log(`[callback] Reframe Job ${jobId} → PROCESSING (${Math.round(progress)}%)`);
        return NextResponse.json({ success: true });
      }

      if (status === "FAILED") {
        if (typeof prisma.videoJob.updateMany === "function") {
          const updateResult = await prisma.videoJob.updateMany({
            where: {
              id: jobId,
              status: {
                notIn: ["COMPLETED", "CANCELLED"],
              },
            },
            data: {
              status: "FAILED",
              error: error || "Reframe job failed",
            },
          });

          if (updateResult.count === 0) {
            console.log(
              `[callback] Ignored FAILED callback; job ${jobId} is already in terminal state.`
            );
            return NextResponse.json({
              success: true,
              ignored: true,
              message: `Job ${jobId} is already in a terminal state`,
            });
          }
        } else {
          await prisma.videoJob.update({
            where: { id: jobId },
            data: {
              status: "FAILED",
              error: error || "Reframe job failed",
            },
          });
        }

        console.log(`[callback] Reframe Job ${jobId} → FAILED: ${error || "Reframe job failed"}`);
        return NextResponse.json({ success: true });
      }

      if (status === "COMPLETED") {
        if (cropTargets === undefined || cropTargets === null) {
          return NextResponse.json(
            { error: "Missing cropTargets for completed reframe job" },
            { status: 400 }
          );
        }

        try {
          validateCropTargetData(cropTargets);
        } catch (valErr) {
          const message = valErr instanceof Error ? valErr.message : "Invalid cropTargets";
          return NextResponse.json({ error: message }, { status: 400 });
        }

        if (typeof prisma.videoJob.updateMany === "function") {
          const updateResult = await prisma.videoJob.updateMany({
            where: {
              id: jobId,
              status: {
                notIn: ["COMPLETED", "CANCELLED"],
              },
            },
            data: {
              status: "COMPLETED",
              progress: 100,
              exportedUrl: exportedUrl || undefined,
              jobData: {
                ...existingJobData,
                kind: "REFRAME",
                cropTargets,
                ...(fallback !== undefined ? { fallback } : {}),
                ...(fallbackStage ? { fallbackStage } : {}),
                ...(fallbackReason ? { fallbackReason } : {}),
                ...(attemptsMade !== undefined ? { attemptsMade } : {}),
              } as unknown as Prisma.InputJsonValue,
              error: null,
            },
          });

          if (updateResult.count === 0) {
            console.log(
              `[callback] Ignored COMPLETED callback; job ${jobId} is already in terminal state.`
            );
            return NextResponse.json({
              success: true,
              ignored: true,
              message: `Job ${jobId} is already in a terminal state`,
            });
          }
        } else {
          await prisma.videoJob.update({
            where: { id: jobId },
            data: {
              status: "COMPLETED",
              progress: 100,
              exportedUrl: exportedUrl || undefined,
              jobData: {
                ...existingJobData,
                kind: "REFRAME",
                cropTargets,
                ...(fallback !== undefined ? { fallback } : {}),
                ...(fallbackStage ? { fallbackStage } : {}),
                ...(fallbackReason ? { fallbackReason } : {}),
                ...(attemptsMade !== undefined ? { attemptsMade } : {}),
              } as unknown as Prisma.InputJsonValue,
              error: null,
            },
          });
        }

        // Also update Demo.exportedUrl if linked and exportedUrl exists
        if (job.demoId && exportedUrl) {
          await prisma.demo.update({
            where: { id: job.demoId },
            data: { exportedUrl },
          });
        }

        console.log(`[callback] Reframe Job ${jobId} → COMPLETED`);
        return NextResponse.json({ success: true });
      }

      return NextResponse.json(
        { error: `Unsupported status for reframe job: ${status}` },
        { status: 400 }
      );
    }

    // ── AVS_DUB callback handling ─────────────────────────────────────
    if (isDubJob) {
      if (status === "COMPLETED") {
        if (typeof alignedVideoUrl !== "string" || !alignedVideoUrl.trim()) {
          return NextResponse.json(
            { error: "Missing or invalid alignedVideoUrl" },
            { status: 400 }
          );
        }
        try {
          const parsed = new URL(alignedVideoUrl);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return NextResponse.json(
              { error: "alignedVideoUrl must be an http or https URL" },
              { status: 400 }
            );
          }
        } catch {
          return NextResponse.json(
            { error: "alignedVideoUrl must be a valid URL" },
            { status: 400 }
          );
        }

        if (
          typeof duration !== "number" ||
          !Number.isFinite(duration) ||
          duration < 0
        ) {
          return NextResponse.json(
            { error: "Invalid duration: must be a finite non-negative number" },
            { status: 400 }
          );
        }

        if (typeof prisma.videoJob.updateMany === "function") {
          const updateResult = await prisma.videoJob.updateMany({
            where: {
              id: jobId,
              status: { notIn: ["COMPLETED", "CANCELLED"] },
            },
            data: {
              status: "COMPLETED",
              progress: 100,
              jobData: {
                ...existingJobData,
                kind: "AVS_DUB",
                alignedVideoUrl,
                duration,
                ...(fallback !== undefined ? { fallback } : {}),
                ...(fallbackStage ? { fallbackStage } : {}),
                ...(fallbackReason ? { fallbackReason } : {}),
                ...(attemptsMade !== undefined ? { attemptsMade } : {}),
              },
            },
          });

          if (updateResult.count === 0) {
            console.log(
              `[callback] Ignored AVS_DUB COMPLETED callback; job ${jobId} is already in terminal state.`
            );
            return NextResponse.json({
              success: true,
              ignored: true,
              message: `Job ${jobId} is already in a terminal state`,
            });
          }
        } else {
          await prisma.videoJob.update({
            where: { id: jobId },
            data: {
              status: "COMPLETED",
              progress: 100,
              jobData: {
                ...existingJobData,
                kind: "AVS_DUB",
                alignedVideoUrl,
                duration,
                ...(fallback !== undefined ? { fallback } : {}),
                ...(fallbackStage ? { fallbackStage } : {}),
                ...(fallbackReason ? { fallbackReason } : {}),
                ...(attemptsMade !== undefined ? { attemptsMade } : {}),
              },
            },
          });
        }

        console.log(`[callback] AVS_DUB job ${jobId} → COMPLETED`);
        return NextResponse.json({ success: true });
      } else {
        const failureError =
          typeof error === "string" && error.trim()
            ? error
            : "Dub-sync alignment failed";

        if (typeof prisma.videoJob.updateMany === "function") {
          const updateResult = await prisma.videoJob.updateMany({
            where: {
              id: jobId,
              status: { notIn: ["COMPLETED", "CANCELLED"] },
            },
            data: {
              status: "FAILED",
              error: failureError,
            },
          });

          if (updateResult.count === 0) {
            console.log(
              `[callback] Ignored AVS_DUB FAILED callback; job ${jobId} is already in terminal state.`
            );
            return NextResponse.json({
              success: true,
              ignored: true,
              message: `Job ${jobId} is already in a terminal state`,
            });
          }
        } else {
          await prisma.videoJob.update({
            where: { id: jobId },
            data: {
              status: "FAILED",
              error: failureError,
            },
          });
        }

        console.log(`[callback] AVS_DUB job ${jobId} → FAILED`);
        return NextResponse.json({ success: true });
      }
    }

    // ── Existing AVS/WTM/Export Handling ─────────────────────────────
    const isCompleted = status === "COMPLETED" && exportedUrl;

    if (typeof prisma.videoJob.updateMany === "function") {
      const updateResult = await prisma.videoJob.updateMany({
        where: {
          id: jobId,
          status: {
            notIn: ["COMPLETED", "CANCELLED"],
          },
        },
        data: {
          status: isCompleted ? "COMPLETED" : "FAILED",
          progress: isCompleted ? 100 : undefined,
          exportedUrl: exportedUrl || undefined,
          error: error || (isCompleted ? undefined : "Export failed"),
        },
      });

      if (updateResult.count === 0) {
        console.log(
          `[callback] Ignored export callback; job ${jobId} is already in terminal state.`
        );
        return NextResponse.json({
          success: true,
          ignored: true,
          message: `Job ${jobId} is already in a terminal state`,
        });
      }
    } else {
      await prisma.videoJob.update({
        where: { id: jobId },
        data: {
          status: isCompleted ? "COMPLETED" : "FAILED",
          progress: isCompleted ? 100 : undefined,
          exportedUrl: exportedUrl || undefined,
          error: error || (isCompleted ? undefined : "Export failed"),
        },
      });
    }

    // ── Also update Demo.exportedUrl if linked ────────────────────────
    if (isCompleted && job.demoId && exportedUrl) {
      await prisma.demo.update({
        where: { id: job.demoId },
        data: { exportedUrl },
      });
    }

    console.log(`[callback] Job ${jobId} → ${isCompleted ? "COMPLETED" : "FAILED"}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[callback] Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
