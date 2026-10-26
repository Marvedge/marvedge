import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateStageCost, resolvePricingModel } from "../costCalculator";
import { executeDubbingStage } from "../providers";
import { parseCliArgs } from "../../cloudCostBenchmark";
import { BenchmarkOrchestrator } from "../orchestrator";
import type { InputMediaMetadata } from "../types";

function createMockWavBuffer(seconds: number = 2.0, sampleRate: number = 16000): Buffer {
  const numChannels = 1;
  const bytesPerSample = 2;
  const dataSize = Math.floor(sampleRate * seconds * numChannels * bytesPerSample);
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

describe("VoiceStudio Benchmark Integration (Task-00103)", () => {
  const originalFetch = global.fetch;
  let tempDir: string;
  let mockMedia: InputMediaMetadata;

  beforeEach(() => {
    vi.restoreAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vs-bench-test-"));
    const dummyVideo = path.join(tempDir, "sample.mp4");
    fs.writeFileSync(dummyVideo, Buffer.from("dummy video content"));
    mockMedia = {
      path: dummyVideo,
      durationSec: 10,
      fileSizeBytes: 1024,
      isSynthetic: true,
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("A. costCalculator assigns strictly $0.00 external API cost to VoiceStudio", () => {
    const pricing = resolvePricingModel("T4");

    const vsCost = calculateStageCost({
      stage: "dubbing",
      status: "real_inference",
      provider: "voicestudio",
      measuredDurationMs: 2500,
      mediaDurationSec: 60,
      completedJobs: 1,
      pricing,
    });

    expect(vsCost.externalApiCostUsd).toBe(0);
    expect(vsCost.computeCostUsd).toBeGreaterThan(0);
    expect(vsCost.totalCostUsd).toBe(vsCost.computeCostUsd);

    const elevenCost = calculateStageCost({
      stage: "dubbing",
      status: "real_inference",
      provider: "elevenlabs",
      measuredDurationMs: 2500,
      mediaDurationSec: 60,
      completedJobs: 1,
      pricing,
    });

    expect(elevenCost.externalApiCostUsd).toBe(0.15);
    expect(elevenCost.totalCostUsd).toBeGreaterThan(vsCost.totalCostUsd);
  });

  it("B. parseCliArgs correctly extracts VoiceStudio CLI arguments", () => {
    const { config } = parseCliArgs([
      "node",
      "cloudCostBenchmark.ts",
      "--provider-dubbing",
      "voicestudio",
      "--voicestudio-url",
      "http://127.0.0.1:3900",
      "--voicestudio-api-key",
      "secret-token-xyz",
      "--voicestudio-model",
      "omnivoice",
      "--voicestudio-fallback-to-paid",
    ]);

    expect(config.dubbingProvider).toBe("voicestudio");
    expect(config.voiceStudioUrl).toBe("http://127.0.0.1:3900");
    expect(config.voiceStudioApiKey).toBe("secret-token-xyz");
    expect(config.voiceStudioModel).toBe("omnivoice");
    expect(config.voiceStudioFallbackToPaid).toBe(true);
  });

  it("C. executeDubbingStage blocks cleanly when VoiceStudio is unreachable", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3900"));

    const result = await executeDubbingStage(mockMedia, "voicestudio");

    expect(result.status).toBe("blocked");
    expect(result.provider).toBe("voicestudio");
    expect(result.error).toBe("VOICESTUDIO_UNAVAILABLE");
    expect(result.notes[0]).toContain("VoiceStudio health check failed");
  });

  it("D. executeDubbingStage blocks when VoiceStudio is in warming 503 state", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "starting",
          step: "load_models",
          label: "Downloading OmniVoice weights...",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      )
    );

    const result = await executeDubbingStage(mockMedia, "voicestudio");

    expect(result.status).toBe("blocked");
    expect(result.error).toBe("VOICESTUDIO_STARTING");
    expect(result.notes[0]).toContain("VoiceStudio service is starting up");
  });

  it("E. executeDubbingStage generates real speech artifact when service is ready", async () => {
    const mockWav = createMockWavBuffer(2.0, 16000);

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/health")) {
        return new Response(
          JSON.stringify({
            status: "ok",
            device: "cuda (NVIDIA Tesla T4)",
            version: "0.5.6",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("/v1/audio/speech")) {
        return new Response(mockWav, {
          status: 200,
          headers: {
            "Content-Type": "audio/wav",
            "Content-Disposition": 'inline; filename="speech.wav"',
          },
        });
      }

      return new Response("Not found", { status: 404 });
    });

    const result = await executeDubbingStage(mockMedia, "voicestudio");

    expect(result.status).toBe("real_inference");
    expect(result.provider).toBe("voicestudio");
    expect(result.outputArtifacts).toBeDefined();
    expect(result.outputArtifacts?.format).toBe("wav");
    expect(result.outputArtifacts?.isGpu).toBe(true);
    expect(result.outputArtifacts?.device).toContain("Tesla T4");

    const artifactPath = result.outputArtifacts?.artifactPath;
    expect(artifactPath).toBeDefined();
    expect(fs.existsSync(artifactPath)).toBe(true);
    expect(fs.statSync(artifactPath).size).toBeGreaterThan(44);

    fs.unlinkSync(artifactPath);
  });

  it("F. BenchmarkOrchestrator end-to-end offline smoke test with VoiceStudio", async () => {
    const mockWav = createMockWavBuffer(1.0, 16000);

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/health")) {
        return new Response(
          JSON.stringify({
            status: "ok",
            device: "cuda (NVIDIA Tesla T4)",
            version: "0.5.6",
          }),
          { status: 200 }
        );
      }
      return new Response(mockWav, {
        status: 200,
        headers: { "Content-Type": "audio/wav" },
      });
    });

    const orchestrator = new BenchmarkOrchestrator({
      config: {
        stages: ["dubbing"],
        dubbingProvider: "voicestudio",
        gpuType: "T4",
        concurrency: 1,
        iterations: 1,
        warmup: 0,
        transcriptionProvider: "fixture",
            },
      inputMedia: mockMedia,
    });

    const report = await orchestrator.run();

    expect(report.summary.overallStatus).toBe("SUCCESS");
    const dubbingStage = report.stages.dubbing;
    expect(dubbingStage).not.toBeNull();
    expect(dubbingStage?.status).toBe("real_inference");
    expect(dubbingStage?.provider).toBe("voicestudio");
    expect(dubbingStage?.cost.externalApiCostUsd).toBe(0);
    expect(dubbingStage?.cost.computeCostUsd).toBeGreaterThanOrEqual(0);

    const artifactPath = dubbingStage?.outputArtifacts?.artifactPath;
    if (artifactPath && fs.existsSync(artifactPath)) {
      fs.unlinkSync(artifactPath);
    }
  });
});
