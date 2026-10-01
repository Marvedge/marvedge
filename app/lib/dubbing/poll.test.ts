import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

import { MAX_DUB_POLLS, pollDubJob, startDubJob } from "./poll";

vi.mock("axios");

const mockPost = vi.mocked(axios.post);
const mockGet = vi.mocked(axios.get);

const REQUEST_BODY = {
  videoUrl: "https://cdn.example/demo.mp4",
  dubUrl: "https://cdn.example/dub.mp3",
  steps: [],
  dubTimings: [],
  duration: 9.7,
  sourceDuration: 9.7,
  demoId: null,
};

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("startDubJob", () => {
  it("posts the sanitized body and returns the job id", async () => {
    mockPost.mockResolvedValueOnce({ data: { success: true, jobId: "job-1" } });
    await expect(startDubJob(REQUEST_BODY)).resolves.toBe("job-1");
    expect(mockPost).toHaveBeenCalledWith("/api/avs/dub", REQUEST_BODY);
  });

  it("throws when the route does not return a job id", async () => {
    mockPost.mockResolvedValueOnce({ data: { success: true } });
    await expect(startDubJob(REQUEST_BODY)).rejects.toThrow("Dubbing did not start");
  });
});

describe("pollDubJob", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("polls through waiting/active to a completed job with the aligned source", async () => {
    mockGet
      .mockResolvedValueOnce({ data: { state: "waiting", progress: 10 } })
      .mockResolvedValueOnce({ data: { state: "active", progress: 50 } })
      .mockResolvedValueOnce({
        data: {
          state: "completed",
          progress: 100,
          aligned: { alignedVideoUrl: "https://cdn.example/aligned.mp4", duration: 11.5 },
        },
      });

    const promise = pollDubJob("job-1", { maxPolls: 10 });
    await vi.advanceTimersByTimeAsync(2500 * 10);
    const outcome = await promise;

    expect(outcome.status).toBe("completed");
    if (outcome.status === "completed") {
      expect(outcome.alignedVideoUrl).toBe("https://cdn.example/aligned.mp4");
      expect(outcome.duration).toBe(11.5);
      expect(outcome.progress).toBe(100);
    }
    expect(mockGet).toHaveBeenNthCalledWith(1, "/api/jobs/job-1");
  });

  it("accepts uppercase statuses from the database", async () => {
    mockGet.mockResolvedValueOnce({ data: { state: "PENDING" } }).mockResolvedValueOnce({
      data: { state: "COMPLETED", aligned: { alignedVideoUrl: "x.mp4", duration: 5 } },
    });
    const promise = pollDubJob("job-1", { maxPolls: 10, intervalMs: 500 });
    await vi.advanceTimersByTimeAsync(500 * 10);
    const outcome = await promise;
    expect(outcome.status).toBe("completed");
  });

  it("returns failed with the backend error message", async () => {
    mockGet.mockResolvedValue({ data: { state: "failed", error: "Worker crashed" } });
    const promise = pollDubJob("job-1", { maxPolls: 10 });
    await vi.advanceTimersByTimeAsync(2500 * 10);
    const outcome = await promise;
    expect(outcome.status).toBe("failed");
    if (outcome.status === "failed") {
      expect(outcome.error).toBe("Worker crashed");
    }
  });

  it("returns cancelled without treating it as an error", async () => {
    mockGet.mockResolvedValueOnce({ data: { state: "cancelled" } });
    const promise = pollDubJob("job-1", { maxPolls: 10 });
    await vi.advanceTimersByTimeAsync(2500 * 10);
    expect(await promise).toMatchObject({ status: "cancelled" });
  });

  it("completes with an empty aligned url when the poller does not surface it", async () => {
    mockGet.mockResolvedValueOnce({ data: { state: "completed" } });
    const promise = pollDubJob("job-1", { maxPolls: 10 });
    await vi.advanceTimersByTimeAsync(2500 * 10);
    const outcome = await promise;
    expect(outcome.status).toBe("completed");
    if (outcome.status === "completed") {
      expect(outcome.alignedVideoUrl).toBe("");
    }
  });

  it("stops early when shouldStop returns true", async () => {
    mockGet.mockResolvedValue({ data: { state: "waiting" } });
    const promise = pollDubJob("job-1", {
      maxPolls: 10,
      shouldStop: () => true,
    });
    await vi.advanceTimersByTimeAsync(2500 * 2);
    const outcome = await promise;
    expect(outcome.status).toBe("stopped");
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("times out after maxPolls without a terminal state", async () => {
    mockGet.mockResolvedValue({ data: { state: "active" } });
    const promise = pollDubJob("job-1", { maxPolls: 3, intervalMs: 500 });
    await vi.advanceTimersByTimeAsync(500 * 10);
    const outcome = await promise;
    expect(outcome.status).toBe("timed_out");
    expect(mockGet).toHaveBeenCalledTimes(3);
  });

  it("retries transient network errors and keeps polling", async () => {
    mockGet.mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce({
      data: { state: "completed", aligned: { alignedVideoUrl: "ok.mp4", duration: 4 } },
    });
    const promise = pollDubJob("job-1", { maxPolls: 5, intervalMs: 500 });
    await vi.advanceTimersByTimeAsync(500 * 10);
    const outcome = await promise;
    expect(outcome.status).toBe("completed");
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("reports progress values as the backend reports them — never fabricates", async () => {
    mockGet
      .mockResolvedValueOnce({ data: { state: "waiting", progress: 20 } })
      .mockResolvedValueOnce({
        data: {
          state: "COMPLETED",
          progress: 100,
          aligned: { alignedVideoUrl: "x.mp4", duration: 5 },
        },
      });
    const seen: number[] = [];
    const promise = pollDubJob("job-1", {
      maxPolls: 10,
      intervalMs: 500,
      onState: (_state, progress) => {
        if (progress !== null) {
          seen.push(progress);
        }
      },
    });
    await vi.advanceTimersByTimeAsync(500 * 10);
    await promise;
    expect(seen).toEqual([20, 100]);
  });
});

// Guards the default cadence/budget the hook relies on for ~10-minute jobs.
describe("poll constants", () => {
  it("polls every 2.5s up to 240 times", () => {
    expect(MAX_DUB_POLLS).toBe(240);
  });
});
