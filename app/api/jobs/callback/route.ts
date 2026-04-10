import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

const CALLBACK_SECRET = process.env.CALLBACK_SECRET || "";

export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!CALLBACK_SECRET || token !== CALLBACK_SECRET) {
      console.warn("[callback] Unauthorized attempt");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Body ──────────────────────────────────────────────────────────
    const body = await req.json();
    const { jobId, status, exportedUrl, error } = body as {
      jobId?: string;
      status?: string;
      exportedUrl?: string;
      error?: string;
    };

    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    // ── Fetch existing job ────────────────────────────────────────────
    const job = await prisma.videoJob.findUnique({
      where: { id: jobId },
      select: { id: true, demoId: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // ── Update VideoJob ───────────────────────────────────────────────
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
