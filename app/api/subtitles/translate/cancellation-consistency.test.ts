import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findUser: vi.fn(),
  findDemo: vi.fn(),
  createJob: vi.fn(),
  findJob: vi.fn(),
  updateJob: vi.fn(),
  updateMany: vi.fn(),
  findTrack: vi.fn(),
  upsertTrack: vi.fn(),
  completion: vi.fn(),
  limited: vi.fn(),
  repeated: vi.fn(),
  after: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/app/lib/audio/rateLimit", () => ({
  isRateLimited: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.session,
}));

vi.mock("@/app/lib/auth/options", () => ({
  authOptions: {},
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: mocks.completion,
      },
    };
  },
}));

vi.mock("@/app/lib/ai/abuseProtection", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/lib/ai/abuseProtection")>()),
  isAiActionRateLimited: mocks.limited,
  isRepeatedSubtitleTranslation: mocks.repeated,
}));

vi.mock("@/app/lib/subtitles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/lib/subtitles")>()),
  isSubtitleTranslateEnabled: () => true,
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    user: {
      findFirst: mocks.findUser,
    },
    demo: {
      findUnique: mocks.findDemo,
    },
    videoJob: {
      create: mocks.createJob,
      findUnique: mocks.findJob,
      update: mocks.updateJob,
      updateMany: mocks.updateMany,
    },
    subtitleTrack: {
      findUnique: mocks.findTrack,
      upsert: mocks.upsertTrack,
    },
  },
}));

import { POST as translate } from "./route";
import { POST as cancel } from "../cancel/route";

type Job = {
  id: string;
  userId: string;
  status: string;
  error: string | null;
  jobData: Record<string, unknown>;
};

let record: Job;

describe("subtitle translation after acknowledged cancellation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "test-key-no-network");

    record = {
      id: "job-1",
      userId: "user-1",
      status: "PROCESSING",
      error: null,
      jobData: {
        kind: "SUBTITLES",
        mode: "translation",
        language: "es",
      },
    };

    mocks.session.mockResolvedValue({
      user: {
        id: "user-1",
        email: "owner@example.test",
      },
    });

    mocks.findUser.mockResolvedValue({
      id: "user-1",
      plan: "PRO",
    });

    mocks.findDemo.mockResolvedValue({
      id: "demo-1",
      userId: "user-1",
      subtitles: [{ start: 0, end: 2, text: "Hello there" }],
      editing: null,
    });

    mocks.findTrack.mockResolvedValue(null);
    mocks.limited.mockResolvedValue(false);
    mocks.repeated.mockResolvedValue(false);

    mocks.createJob.mockImplementation(async () => ({ ...record }));
    mocks.findJob.mockImplementation(async () => ({ ...record }));

    mocks.transaction.mockImplementation(
      async (
        work: (tx: {
          videoJob: {
            updateMany: typeof mocks.updateMany;
          };
          subtitleTrack: {
            upsert: typeof mocks.upsertTrack;
          };
        }) => Promise<unknown>
      ) => {
        const previous = structuredClone(record);

        try {
          return await work({
            videoJob: {
              updateMany: mocks.updateMany,
            },
            subtitleTrack: {
              upsert: mocks.upsertTrack,
            },
          });
        } catch (error) {
          record = previous;
          throw error;
        }
      }
    );

    mocks.upsertTrack.mockResolvedValue({});

    mocks.updateJob.mockImplementation(async ({ data }: { data: Partial<Job> }) => {
      Object.assign(record, data);
      return { ...record };
    });

    mocks.updateMany.mockImplementation(
      async ({
        where,
        data,
      }: {
        where: {
          id: string;
          userId?: string;
          status?: {
            in: string[];
          };
          jobData?: {
            path: string[];
            equals: string;
          };
        };
        data: Partial<Job>;
      }) => {
        if (
          where.id !== record.id ||
          (where.userId && where.userId !== record.userId) ||
          (where.status && !where.status.in.includes(record.status)) ||
          (where.jobData && record.jobData.kind !== where.jobData.equals)
        ) {
          return { count: 0 };
        }

        Object.assign(record, data);
        return { count: 1 };
      }
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function providerResponse(count: number) {
    return {
      choices: [
        {
          message: {
            content: JSON.stringify({
              segments: Array.from({ length: count }, (_, i) => ({
                i,
                text: `Traducción ${i}`,
              })),
            }),
          },
        },
      ],
    };
  }

  async function runTranslation(cueCount = 1, beforeDispatch?: () => void) {
    mocks.findDemo.mockResolvedValue({
      id: "demo-1",
      userId: "user-1",
      subtitles: Array.from({ length: cueCount }, (_, i) => ({
        start: i * 3,
        end: i * 3 + 2,
        text: `Source subtitle ${i}`,
      })),
      editing: null,
    });

    const response = await translate(
      new NextRequest("http://localhost/api/subtitles/translate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          demoId: "demo-1",
          sourceLanguage: "en",
          targetLanguage: "es",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.after).toHaveBeenCalledTimes(1);

    beforeDispatch?.();

    const dispatch = mocks.after.mock.calls[0][0] as () => Promise<void>;
    await dispatch();
  }

  it.each(["success", "failure"])(
    "preserves cancellation when the provider later returns %s",
    async (outcome) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

      let cancellationAcknowledged = false;

      mocks.completion.mockImplementationOnce(async () => {
        const response = await cancel(
          new NextRequest("http://localhost/api/subtitles/cancel", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              jobId: "job-1",
            }),
          })
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          success: true,
          cancelled: true,
          status: "CANCELLED",
        });

        cancellationAcknowledged = true;

        if (outcome === "failure") {
          throw new Error("Provider disconnected after cancellation");
        }

        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  segments: [{ i: 0, text: "Hola" }],
                }),
              },
            },
          ],
        };
      });

      try {
        const response = await translate(
          new NextRequest("http://localhost/api/subtitles/translate", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              demoId: "demo-1",
              sourceLanguage: "en",
              targetLanguage: "es",
            }),
          })
        );

        expect(response.status).toBe(200);
        expect(mocks.after).toHaveBeenCalledTimes(1);

        const dispatch = mocks.after.mock.calls[0][0] as () => Promise<void>;
        await dispatch();

        expect(cancellationAcknowledged).toBe(true);
        expect(record.status).toBe("CANCELLED");
        expect(record.error).toBe("Cancelled by the user");
        expect(mocks.upsertTrack).not.toHaveBeenCalled();
      } finally {
        log.mockRestore();
      }
    }
  );

  it("completes a translation and saves its target track", async () => {
    mocks.completion.mockResolvedValueOnce(providerResponse(1));

    await runTranslation();

    expect(record.status).toBe("COMPLETED");
    expect(record.error).toBeNull();

    expect(record.jobData).toMatchObject({
      kind: "SUBTITLES",
      mode: "translation",
      provider: "openai",
      language: "es",
      sourceLanguage: "en",
      subtitles: [
        expect.objectContaining({
          text: "Traducción 0",
        }),
      ],
    });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);

    expect(mocks.upsertTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          demoId_language: {
            demoId: "demo-1",
            language: "es",
          },
        },
        update: expect.objectContaining({
          status: "READY",
          source: "translation",
          cues: record.jobData.subtitles,
        }),
      })
    );
  });

  it("does not call OpenAI when cancelled before dispatch starts", async () => {
    await runTranslation(1, () => {
      record.status = "CANCELLED";
      record.error = "Cancelled by the user";
    });

    expect(record.status).toBe("CANCELLED");
    expect(record.error).toBe("Cancelled by the user");
    expect(mocks.completion).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.upsertTrack).not.toHaveBeenCalled();
  });

  it("combines multiple batches into one completed target track", async () => {
    mocks.completion
      .mockResolvedValueOnce(providerResponse(40))
      .mockResolvedValueOnce(providerResponse(1));

    await runTranslation(41);

    expect(record.status).toBe("COMPLETED");
    expect(mocks.completion).toHaveBeenCalledTimes(2);
    expect(record.jobData.subtitles).toHaveLength(41);
    expect(mocks.upsertTrack).toHaveBeenCalledTimes(1);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("does not request the next batch after acknowledged cancellation", async () => {
    mocks.completion.mockImplementationOnce(async () => {
      const response = await cancel(
        new NextRequest("http://localhost/api/subtitles/cancel", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            jobId: "job-1",
          }),
        })
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        success: true,
        cancelled: true,
        status: "CANCELLED",
      });

      return providerResponse(40);
    });

    await runTranslation(41);

    expect(record.status).toBe("CANCELLED");
    expect(record.error).toBe("Cancelled by the user");
    expect(mocks.completion).toHaveBeenCalledTimes(1);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.upsertTrack).not.toHaveBeenCalled();
  });

  it("rolls back completion when target-track storage fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    mocks.completion.mockResolvedValueOnce(providerResponse(1));
    mocks.upsertTrack.mockRejectedValueOnce(new Error("Track write failed"));

    try {
      await runTranslation();

      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      expect(record.status).toBe("FAILED");
      expect(record.error).toBe("Track write failed");
      expect(record.jobData.subtitles).toBeUndefined();
      expect(record.jobData.provider).toBeUndefined();
    } finally {
      log.mockRestore();
    }
  });

  it("rejects a JSON null body without creating a translation job", async () => {
    const response = await translate(
      new NextRequest("http://localhost/api/subtitles/translate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: "null",
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.createJob).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.completion).not.toHaveBeenCalled();
  });

  it.each(["present", "absent"])(
    "translates saved active-track edits when stored track is %s",
    async (trackState) => {
      mocks.findDemo.mockResolvedValue({
        id: "demo-1",
        userId: "user-1",
        subtitles: [{ start: 0, end: 2, text: "Original incorrect transcript" }],
        editing: {
          subtitleLanguage: "en",
          subtitles: [{ start: 0, end: 2, text: "Corrected saved transcript" }],
        },
      });

      mocks.findTrack.mockResolvedValue(
        trackState === "present"
          ? {
              cues: [{ start: 0, end: 2, text: "Stale stored transcript" }],
            }
          : null
      );

      mocks.completion.mockResolvedValueOnce(providerResponse(1));

      const response = await translate(
        new NextRequest("http://localhost/api/subtitles/translate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            demoId: "demo-1",
            sourceLanguage: "en",
            targetLanguage: "es",
          }),
        })
      );

      expect(response.status).toBe(200);
      expect(mocks.after).toHaveBeenCalledTimes(1);

      const dispatch = mocks.after.mock.calls[0][0] as () => Promise<void>;
      await dispatch();

      expect(mocks.completion).toHaveBeenCalledTimes(1);

      const request = mocks.completion.mock.calls[0][0] as {
        messages: Array<{ role: string; content: string }>;
      };

      const prompt = request.messages.find((message) => message.role === "user")?.content;

      expect(prompt).toContain("Corrected saved transcript");
      expect(prompt).not.toContain("Original incorrect transcript");
      expect(prompt).not.toContain("Stale stored transcript");
      expect(record.status).toBe("COMPLETED");
    }
  );

  it.each([
    {
      label: "another language is active",
      editing: {
        subtitleLanguage: "fr",
        subtitles: [{ start: 0, end: 2, text: "Unrelated French editor text" }],
      },
    },
    {
      label: "the active language has no saved subtitle array",
      editing: {
        subtitleLanguage: "en",
      },
    },
  ])(
    "keeps source-track selection isolated from unrelated editor state: $label",
    async ({ editing }) => {
      mocks.findDemo.mockResolvedValue({
        id: "demo-1",
        userId: "user-1",
        subtitles: [{ start: 0, end: 2, text: "Older generated text" }],
        editing,
      });

      mocks.findTrack.mockResolvedValue({
        cues: [{ start: 0, end: 2, text: "Requested English source track" }],
      });

      mocks.completion.mockResolvedValueOnce(providerResponse(1));

      const response = await translate(
        new NextRequest("http://localhost/api/subtitles/translate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            demoId: "demo-1",
            sourceLanguage: "en",
            targetLanguage: "es",
          }),
        })
      );

      expect(response.status).toBe(200);
      expect(mocks.after).toHaveBeenCalledTimes(1);

      const dispatch = mocks.after.mock.calls[0][0] as () => Promise<void>;
      await dispatch();

      expect(mocks.completion).toHaveBeenCalledTimes(1);

      const request = mocks.completion.mock.calls[0][0] as {
        messages: Array<{ role: string; content: string }>;
      };

      const prompt = request.messages.find((message) => message.role === "user")?.content;

      expect(prompt).toContain("Requested English source track");
      expect(prompt).not.toContain("Unrelated French editor text");
      expect(prompt).not.toContain("Older generated text");
      expect(record.status).toBe("COMPLETED");
    }
  );

  it("does not resurrect subtitles deleted from the active editor track", async () => {
    mocks.findDemo.mockResolvedValue({
      id: "demo-1",
      userId: "user-1",
      subtitles: [{ start: 0, end: 2, text: "Deleted original text" }],
      editing: {
        subtitleLanguage: "en",
        subtitles: [],
      },
    });

    mocks.findTrack.mockResolvedValue({
      cues: [{ start: 0, end: 2, text: "Deleted stored text" }],
    });

    const response = await translate(
      new NextRequest("http://localhost/api/subtitles/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          demoId: "demo-1",
          sourceLanguage: "en",
          targetLanguage: "es",
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "There are no subtitles to translate yet. Generate them first.",
    });
    expect(mocks.createJob).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.completion).not.toHaveBeenCalled();
    expect(mocks.upsertTrack).not.toHaveBeenCalled();
  });
});
