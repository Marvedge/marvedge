import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { validateCropTargetData } from "@/app/types/editor/crop-target";

export async function POST(req: NextRequest) {
  try {
    const callbackSecret = process.env.CALLBACK_SECRET || "";

    // ── Auth ──────────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!callbackSecret || token !== callbackSecret) {
      console.warn("[callback] Unauthorized attempt");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Body ──────────────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
    }

    const { jobId, status, exportedUrl, error, cropTargets } = body as {
      jobId?: string;
      status?: string;
      exportedUrl?: string;
      error?: string;
      cropTargets?: unknown;
    };

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    // ── Fetch existing job ────────────────────────────────────────────
    const job = await prisma.videoJob.findUnique({
      where: { id: jobId },
      select: { id: true, demoId: true, jobData: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const existingJobData =
      job.jobData && typeof job.jobData === "object" && !Array.isArray(job.jobData)
        ? (job.jobData as Record<string, unknown>)
        : {};
    const isReframeJob = existingJobData.kind === "REFRAME";

    // ── Reframe Job Handling ─────────────────────────────────────────
    if (cropTargets !== undefined || isReframeJob) {
      if (!isReframeJob) {
        return NextResponse.json(
          { error: "Job is not a REFRAME job" },
          { status: 400 }
        );
      }

      if (status === "FAILED") {
        await prisma.videoJob.update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            error: error || "Reframe job failed",
          },
        });
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
          const message =
            valErr instanceof Error ? valErr.message : "Invalid cropTargets";
          return NextResponse.json({ error: message }, { status: 400 });
        }

        await prisma.videoJob.update({
          where: { id: jobId },
          data: {
            status: "COMPLETED",
            progress: 100,
            jobData: {
              ...existingJobData,
              kind: "REFRAME",
              cropTargets,
            },
            error: null,
          },
        });

        console.log(`[callback] Reframe Job ${jobId} → COMPLETED`);
        return NextResponse.json({ success: true });
      }

      return NextResponse.json(
        { error: `Unsupported status for reframe job: ${status}` },
        { status: 400 }
      );
    }

    // ── Existing AVS/WTM/Export Handling ─────────────────────────────
    const isCompleted = status === "COMPLETED" && exportedUrl;

    await prisma.videoJob.update({
      where: { id: jobId },
      data: {
        status: isCompleted ? "COMPLETED" : "FAILED",
        progress: isCompleted ? 100 : undefined,
        exportedUrl: exportedUrl || undefined,
        error: error || (isCompleted ? undefined : "Export failed"),
      },
    });

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
