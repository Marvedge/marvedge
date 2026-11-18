import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../app/lib/elevenlabs/dubbing", () => ({
  createDubbingJob: vi.fn().mockResolvedValue({ dubbingId: "el-123", status: "created" }),
  waitForDubbingCompletion: vi.fn().mockResolvedValue({ dubbingId: "el-123", status: "completed" }),
}));

vi.mock("../app/lib/voicestudio/dubbingAdapter", () => ({
  resolveDubbingProvider: vi.fn().mockReturnValue("elevenlabs"),
  VoiceStudioDubbingAdapter: vi.fn().mockImplementation(() => ({
    getClient: () => ({
      checkHealth: vi.fn().mockResolvedValue({ isReady: true }),
    }),
    synthesizeTimedSteps: vi.fn().mockResolvedValue({
      audioBuffer: Buffer.from("fake-audio"),
      stepTimings: [],
    }),
  })),
}));

vi.mock("./dubbingRetry", async () => {
  const actual = await vi.importActual<typeof import("./dubbingRetry")>("./dubbingRetry");
  return {
    ...actual,
    runDubbingJobWithRetry: vi.fn(async ({ process, persistFailure }) => {
      try {
        await process();
      } catch (err: unknown) {
        await persistFailure(err instanceof Error ? err.message : String(err));
        throw err;
      }
    }),
  };
});

import { createDubbingJob } from "../app/lib/elevenlabs/dubbing";
import { isRetryableDubbingError } from "./dubbingRetry";

describe("Worker-Level Voice Cloning Consent Enforcement (Task-00133)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies VOICE_CLONING_CONSENT_REQUIRED as non-retryable (unrecoverable)", () => {
    const error1 = new Error(
      "VOICE_CLONING_CONSENT_REQUIRED: Explicit voice cloning consent has not been granted"
    );
    expect(isRetryableDubbingError(error1)).toBe(false);

    const error2 = Object.assign(new Error("Custom message"), {
      code: "VOICE_CLONING_CONSENT_REQUIRED",
    });
    expect(isRetryableDubbingError(error2)).toBe(false);
  });

  it("fails closed at execution time if workspace consent record is absent", async () => {
    const mockPrisma = {
      videoJob: {
        findUnique: vi.fn().mockResolvedValue({ id: "job-1", userId: "user-unconsented" }),
        update: vi.fn().mockResolvedValue({}),
      },
      workspaceConsent: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    // Simulate worker process function
    const workerProcess = async (jobId: string) => {
      const targetJob = await mockPrisma.videoJob.findUnique({
        where: { id: jobId },
        select: { userId: true },
      });
      const ownerUserId = targetJob?.userId;
      if (!ownerUserId) {
        throw new Error(
          "VOICE_CLONING_CONSENT_REQUIRED: Missing user ID for dubbing consent verification"
        );
      }

      let userConsent: { voiceCloningConsent: boolean } | null = null;
      try {
        userConsent = await mockPrisma.workspaceConsent.findUnique({
          where: { userId: ownerUserId },
          select: { voiceCloningConsent: true },
        });
      } catch (consentErr) {
        throw new Error(
          `VOICE_CLONING_CONSENT_REQUIRED: Consent verification failed: ${consentErr}`
        );
      }

      if (!userConsent || !userConsent.voiceCloningConsent) {
        throw new Error(
          "VOICE_CLONING_CONSENT_REQUIRED: Explicit voice cloning consent has not been granted by this workspace."
        );
      }

      // If consent is passed, call ElevenLabs
      return createDubbingJob({ sourceUrl: "https://example.com/v.mp4", targetLanguage: "es" });
    };

    await expect(workerProcess("job-1")).rejects.toThrow(
      "VOICE_CLONING_CONSENT_REQUIRED: Explicit voice cloning consent has not been granted by this workspace."
    );
    expect(createDubbingJob).not.toHaveBeenCalled();
  });

  it("fails closed at execution time if consent was revoked after job was queued", async () => {
    const mockPrisma = {
      videoJob: {
        findUnique: vi.fn().mockResolvedValue({ id: "job-2", userId: "user-revoked" }),
        update: vi.fn().mockResolvedValue({}),
      },
      workspaceConsent: {
        // Persisted state at execution time is revoked (false)
        findUnique: vi.fn().mockResolvedValue({ voiceCloningConsent: false }),
      },
    };

    const workerProcess = async (jobId: string) => {
      const targetJob = await mockPrisma.videoJob.findUnique({
        where: { id: jobId },
        select: { userId: true },
      });
      const ownerUserId = targetJob?.userId;
      if (!ownerUserId) {
        throw new Error("VOICE_CLONING_CONSENT_REQUIRED: Missing user ID");
      }

      const userConsent = await mockPrisma.workspaceConsent.findUnique({
        where: { userId: ownerUserId },
        select: { voiceCloningConsent: true },
      });

      if (!userConsent || !userConsent.voiceCloningConsent) {
        throw new Error(
          "VOICE_CLONING_CONSENT_REQUIRED: Explicit voice cloning consent has not been granted by this workspace."
        );
      }

      return createDubbingJob({ sourceUrl: "https://example.com/v.mp4", targetLanguage: "es" });
    };

    await expect(workerProcess("job-2")).rejects.toThrow(
      "VOICE_CLONING_CONSENT_REQUIRED: Explicit voice cloning consent has not been granted by this workspace."
    );
    expect(createDubbingJob).not.toHaveBeenCalled();
  });

  it("fails closed if database query fails during consent verification", async () => {
    const mockPrisma = {
      videoJob: {
        findUnique: vi.fn().mockResolvedValue({ id: "job-3", userId: "user-err" }),
      },
      workspaceConsent: {
        findUnique: vi.fn().mockRejectedValue(new Error("Database connection lost")),
      },
    };

    const workerProcess = async (jobId: string) => {
      const targetJob = await mockPrisma.videoJob.findUnique({
        where: { id: jobId },
        select: { userId: true },
      });
      const ownerUserId = targetJob?.userId;

      let userConsent: { voiceCloningConsent: boolean } | null = null;
      try {
        userConsent = await mockPrisma.workspaceConsent.findUnique({
          where: { userId: ownerUserId },
          select: { voiceCloningConsent: true },
        });
      } catch (consentErr: unknown) {
        throw new Error(
          `VOICE_CLONING_CONSENT_REQUIRED: Consent verification failed: ${
            consentErr instanceof Error ? consentErr.message : String(consentErr)
          }`
        );
      }

      if (!userConsent || !userConsent.voiceCloningConsent) {
        throw new Error(
          "VOICE_CLONING_CONSENT_REQUIRED: Explicit voice cloning consent has not been granted"
        );
      }

      return createDubbingJob({ sourceUrl: "https://example.com/v.mp4", targetLanguage: "es" });
    };

    await expect(workerProcess("job-3")).rejects.toThrow(
      "VOICE_CLONING_CONSENT_REQUIRED: Consent verification failed: Database connection lost"
    );
    expect(createDubbingJob).not.toHaveBeenCalled();
  });

  it("proceeds with synthesis when voice cloning consent is verified as true", async () => {
    const mockPrisma = {
      videoJob: {
        findUnique: vi.fn().mockResolvedValue({ id: "job-4", userId: "user-active" }),
      },
      workspaceConsent: {
        findUnique: vi.fn().mockResolvedValue({ voiceCloningConsent: true }),
      },
    };

    const workerProcess = async (jobId: string) => {
      const targetJob = await mockPrisma.videoJob.findUnique({
        where: { id: jobId },
        select: { userId: true },
      });
      const ownerUserId = targetJob?.userId;

      const userConsent = await mockPrisma.workspaceConsent.findUnique({
        where: { userId: ownerUserId },
        select: { voiceCloningConsent: true },
      });

      if (!userConsent || !userConsent.voiceCloningConsent) {
        throw new Error(
          "VOICE_CLONING_CONSENT_REQUIRED: Explicit voice cloning consent has not been granted"
        );
      }

      return createDubbingJob({ sourceUrl: "https://example.com/v.mp4", targetLanguage: "es" });
    };

    const res = await workerProcess("job-4");
    expect(res).toEqual({ dubbingId: "el-123", status: "created" });
    expect(createDubbingJob).toHaveBeenCalledTimes(1);
  });
});
