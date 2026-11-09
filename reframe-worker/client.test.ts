import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CropTargetData } from "../app/types/editor/crop-target";
import { reframeInferenceDurationSeconds } from "../app/lib/monitoring/metrics";
import { callMlInference } from "./client";

const cropTargets: CropTargetData = {
  schema_version: 1,
  source: { width: 1920, height: 1080, fps: 30, duration_sec: 5 },
  output: { aspect_ratio: "9:16" },
  crop_targets: [
    {
      timestamp_sec: 0,
      crop: { x: 420, y: 0, width: 608, height: 1080 },
    },
  ],
};

describe("callMlInference latency metrics", () => {
  beforeEach(() => {
    reframeInferenceDurationSeconds.reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("records successful inference duration in seconds", async () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(1000).mockReturnValueOnce(2750);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ ok: true, crop_targets: cropTargets }),
      })
    );

    await expect(
      callMlInference("http://ml-service", {
        videoUrl: "https://example.com/video.mp4",
        targetAspectRatio: "9:16",
      })
    ).resolves.toEqual(cropTargets);

    const metric = await reframeInferenceDurationSeconds.get();
    const duration = metric.values.find(
      (value) => value.metricName === "marvedge_reframe_inference_duration_seconds_sum"
    );
    expect(duration).toMatchObject({ labels: { status: "success" }, value: 1.75 });
  });

  it("passes the measured duration to the shared-observation hook", async () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(1000).mockReturnValueOnce(2750);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ ok: true, crop_targets: cropTargets }),
      })
    );
    const onDuration = vi.fn();

    await callMlInference(
      "http://ml-service",
      { videoUrl: "https://example.com/video.mp4", targetAspectRatio: "9:16" },
      { onDuration }
    );

    expect(onDuration).toHaveBeenCalledWith("success", 1.75);
  });

  it("does not fail inference if the shared-observation hook throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ ok: true, crop_targets: cropTargets }),
      })
    );
    const onDuration = vi.fn().mockImplementation(() => {
      throw new Error("metrics storage unavailable");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      callMlInference(
        "http://ml-service",
        { videoUrl: "https://example.com/video.mp4", targetAspectRatio: "9:16" },
        { onDuration }
      )
    ).resolves.toEqual(cropTargets);
  });

  it("records failed inference duration and preserves the request error", async () => {
    const requestError = new Error("request failed");
    vi.spyOn(performance, "now").mockReturnValueOnce(2000).mockReturnValueOnce(3500);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(requestError));

    await expect(
      callMlInference("http://ml-service", {
        videoUrl: "https://example.com/video.mp4",
        targetAspectRatio: "9:16",
      })
    ).rejects.toBe(requestError);

    const metric = await reframeInferenceDurationSeconds.get();
    const duration = metric.values.find(
      (value) => value.metricName === "marvedge_reframe_inference_duration_seconds_sum"
    );
    expect(duration).toMatchObject({ labels: { status: "failure" }, value: 1.5 });
  });

  it("sends the gateway token header when ML_GATEWAY_TOKEN is configured", async () => {
    process.env.ML_GATEWAY_TOKEN = "secret-123";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true, crop_targets: cropTargets }),
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await callMlInference("http://ml-service", {
        videoUrl: "https://example.com/video.mp4",
        targetAspectRatio: "9:16",
      });
    } finally {
      delete process.env.ML_GATEWAY_TOKEN;
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      "x-gateway-token": "secret-123",
    });
  });

  it("omits the gateway token header when ML_GATEWAY_TOKEN is unset", async () => {
    delete process.env.ML_GATEWAY_TOKEN;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true, crop_targets: cropTargets }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await callMlInference("http://ml-service", {
      videoUrl: "https://example.com/video.mp4",
      targetAspectRatio: "9:16",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty("x-gateway-token");
  });
});
