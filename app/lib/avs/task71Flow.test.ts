import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as dubPost } from "@/app/api/avs/dub/route";
import { POST as callbackPost } from "@/app/api/jobs/callback/route";
import { processDubbingJob } from "@/app/lib/avs/dubbingProcessor";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { dubbingQueue } from "@/app/lib/queue";
import type { Prisma, VideoJob } from "@prisma/client";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
    demo: { findUnique: vi.fn() },
    videoJob: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/app/lib/queue", () => ({
  dubbingQueue: {
    add: vi.fn(),
  },
}));

function toPrismaJobClient<T>(promise: Promise<T>): Prisma.Prisma__VideoJobClient<T, never> {
  Object.defineProperty(promise, Symbol.toStringTag, {
    value: "PrismaPromise",
    configurable: true,
  });
  return Object.assign(promise, {
    demo: vi.fn(),
    user: vi.fn(),
  }) as unknown as Prisma.Prisma__VideoJobClient<T, never>;
}

function toPrismaPromise<T>(promise: Promise<T>): Prisma.PrismaPromise<T> {
  Object.defineProperty(promise, Symbol.toStringTag, {
    value: "PrismaPromise",
    configurable: true,
  });
  return promise as Prisma.PrismaPromise<T>;
}

describe("Task 71: Complete Dashboard -> Queue -> Worker -> Callback E2E Flow", () => {
  it("successfully passes complete end-to-end flow with stubbed dubbing and prerecorded audio", async () => {
    process.env.AVS_ENABLED = "true";
    process.env.CALLBACK_SECRET = "task71-e2e-secret";
    process.env.APP_URL = "http://localhost:3000";

    const userId = "user-pro-task71";
    const demoId = "demo-task71";
    const jobId = "video-job-task71-999";

    // 1. In-memory database simulation for VideoJob
    let currentJob: VideoJob | null = null;

    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: userId, email: "pro@example.com" },
    } as never);

    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: userId,
      plan: "PRO",
    } as never);

    vi.mocked(prisma.demo.findUnique).mockResolvedValue({
      id: demoId,
      userId,
    } as never);

    vi.mocked(prisma.videoJob.create).mockImplementation(({ data }: Prisma.VideoJobCreateArgs) =>
      toPrismaJobClient(
        (async () => {
          currentJob = {
            id: jobId,
            userId: (data as { userId: string }).userId ?? userId,
            demoId: (data as { demoId?: string | null }).demoId ?? demoId,
            status: data.status ?? "PENDING",
            progress: data.progress ?? 0,
            videoUrl: data.videoUrl,
            jobData: (data.jobData as Prisma.JsonValue) ?? {},
            exportedUrl: data.exportedUrl ?? null,
            error: data.error ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          return currentJob;
        })()
      )
    );

    vi.mocked(prisma.videoJob.findUnique).mockImplementation(
      ({ where }: Prisma.VideoJobFindUniqueArgs) =>
        toPrismaJobClient(Promise.resolve(where.id === jobId ? currentJob : null))
    );

    vi.mocked(prisma.videoJob.updateMany).mockImplementation(
      ({ where, data }: Prisma.VideoJobUpdateManyArgs) =>
        toPrismaPromise(
          (async () => {
            if (where?.id === jobId && currentJob) {
              const notIn =
                where.status && typeof where.status === "object" && "notIn" in where.status
                  ? (where.status.notIn as string[])
                  : undefined;
              if (notIn && notIn.includes(currentJob.status)) {
                return { count: 0 };
              }
              currentJob = {
                ...currentJob,
                ...(data as Partial<VideoJob>),
                jobData: (data.jobData !== undefined
                  ? data.jobData
                  : currentJob.jobData) as Prisma.JsonValue,
                updatedAt: new Date(),
              };
              return { count: 1 };
            }
            return { count: 0 };
          })()
        )
    );

    let queuedPayload: any = null;
    vi.mocked(dubbingQueue.add).mockImplementation(async (name: string, data: any, opts: any) => {
      queuedPayload = { name, data, opts };
      return { id: "bullmq-" + jobId } as any;
    });

    // ── STEP 1: DASHBOARD API CALL ──
    const dashboardRequest = new NextRequest("http://localhost:3000/api/avs/dub", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoUrl: "https://storage.googleapis.com/test-bucket/source-video.mp4",
        dubUrl: "https://storage.googleapis.com/test-bucket/prerecorded-audio.mp3",
        steps: [
          { id: "step-1", index: 0, startTime: 0, endTime: 4.0 },
          { id: "step-2", index: 1, startTime: 4.0, endTime: 10.0 },
        ],
        dubTimings: [
          { stepId: "step-1", start: 0, end: 4.2 },
          { stepId: "step-2", start: 4.2, end: 10.5 },
        ],
        duration: 10.0,
        demoId,
      }),
    });

    const dashboardResponse = await dubPost(dashboardRequest);
    expect(dashboardResponse.status).toBe(200);
    const dashboardData = await dashboardResponse.json();
    expect(dashboardData).toEqual({ success: true, jobId });

    // ── STEP 2: VERIFY DATABASE & QUEUE ──
    expect(currentJob).not.toBeNull();
    expect(currentJob!.status).toBe("PENDING");
    expect((currentJob!.jobData as Record<string, unknown>).kind).toBe("AVS_DUB");
    expect(queuedPayload).not.toBeNull();
    expect(queuedPayload.name).toBe("avs-dub");
    expect(queuedPayload.data.jobId).toBe(jobId);
    expect(queuedPayload.data.dubUrl).toBe(
      "https://storage.googleapis.com/test-bucket/prerecorded-audio.mp3"
    );

    // ── STEP 3: WORKER PROCESSOR EXECUTION (with stubbed Cloud Run /avs-dub) ──
    const progressList: number[] = [];
    const stubbedInvokeDubSync = vi.fn().mockResolvedValue({
      recipeId: "avs-dub",
      alignedVideoUrl: "http://localhost:8080/artifacts/aligned-prerecorded.mp4",
      duration: 10.5,
    });

    const stubbedUploadToCloudinary = vi.fn().mockResolvedValue({
      secure_url: "https://res.cloudinary.com/marvedge/video/upload/v12345/aligned-prerecorded.mp4",
    });

    // ── STEP 4: WORKER POSTS CALLBACK TO /api/jobs/callback ──
    const deliverCallback = async (callbackPayload: any) => {
      const callbackRequest = new NextRequest("http://localhost:3000/api/jobs/callback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.CALLBACK_SECRET}`,
        },
        body: JSON.stringify(callbackPayload),
      });

      const callbackResponse = await callbackPost(callbackRequest);
      expect(callbackResponse.status).toBe(200);
      const callbackResult = await callbackResponse.json();
      expect(callbackResult).toEqual({ success: true });
    };

    // Execute the exact worker pipeline
    await processDubbingJob(queuedPayload.data, {
      invokeDubSync: stubbedInvokeDubSync,
      uploadToCloudinary: stubbedUploadToCloudinary,
      postCallback: deliverCallback,
      updateProgress: (pct) => {
        progressList.push(pct);
      },
    });

    expect(stubbedInvokeDubSync).toHaveBeenCalledWith({
      videoUrl: "https://storage.googleapis.com/test-bucket/source-video.mp4",
      dubUrl: "https://storage.googleapis.com/test-bucket/prerecorded-audio.mp3",
      steps: [
        { id: "step-1", index: 0, startTime: 0, endTime: 4.0 },
        { id: "step-2", index: 1, startTime: 4.0, endTime: 10.0 },
      ],
      dubTimings: [
        { stepId: "step-1", start: 0, end: 4.2 },
        { stepId: "step-2", start: 4.2, end: 10.5 },
      ],
    });
    expect(stubbedUploadToCloudinary).toHaveBeenCalledWith(
      "http://localhost:8080/artifacts/aligned-prerecorded.mp4"
    );

    // ── STEP 5: VERIFY FINAL DATABASE STATE ──
    expect(currentJob!.status).toBe("COMPLETED");
    expect(currentJob!.progress).toBe(100);
    expect((currentJob!.jobData as Record<string, unknown>).kind).toBe("AVS_DUB");
    expect((currentJob!.jobData as Record<string, unknown>).alignedVideoUrl).toBe(
      "https://res.cloudinary.com/marvedge/video/upload/v12345/aligned-prerecorded.mp4"
    );
    expect((currentJob!.jobData as Record<string, unknown>).duration).toBe(10.5);
    expect(progressList).toEqual([20, 40, 70, 90, 100]);
  });
});
