import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { parseCliArgs, runBenchmarkCli } from "../../cloudCostBenchmark";

describe("CLI Parsing & Exit Code Semantics", () => {
  it("parses CLI flags including provider selection and concurrency", () => {
    const argv = [
      "node",
      "cloudCostBenchmark.ts",
      "--stages=reframe,captions",
      "--concurrency=3",
      "--iterations=5",
      "--warmup=2",
      "--gpu-type=T4",
      "--hourly-rate=0.45",
      "--provider-reframe=autoflip",
      "--provider-avs=talknet",
      "--provider-transcription=groq",
      "--provider-dubbing=elevenlabs",
      "--output-json=results/out.json",
      "--output-markdown=results/out.md",
    ];

    const { config, outputJsonPath, outputMarkdownPath } = parseCliArgs(argv);

    expect(config.stages).toEqual(["reframe", "captions"]);
    expect(config.concurrency).toBe(3);
    expect(config.iterations).toBe(5);
    expect(config.warmup).toBe(2);
    expect(config.gpuType).toBe("T4");
    expect(config.hourlyRateUsd).toBe(0.45);
    expect(config.reframeProvider).toBe("autoflip");
    expect(config.avsProvider).toBe("talknet");
    expect(config.transcriptionProvider).toBe("groq");
    expect(config.dubbingProvider).toBe("elevenlabs");
    expect(outputJsonPath).toBe("results/out.json");
    expect(outputMarkdownPath).toBe("results/out.md");
  });

  it("returns exit code 0 for valid offline fixture execution", async () => {
    const tmpDir = path.join(os.tmpdir(), "cli-test-" + Date.now());
    const jsonPath = path.join(tmpDir, "report.json");
    const mdPath = path.join(tmpDir, "report.md");

    // Create a tiny dummy file as input to bypass ffmpeg in fast unit tests
    const dummyFile = path.join(tmpDir, "dummy_cli_test.mp4");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    fs.writeFileSync(dummyFile, "dummy media content for test");

    try {
      const argv = [
        "node",
        "cloudCostBenchmark.ts",
        `--input=${dummyFile}`,
        "--stages=captions",
        "--concurrency=1",
        "--iterations=1",
        "--warmup=0",
        `--output-json=${jsonPath}`,
        `--output-markdown=${mdPath}`,
      ];

      const exitCode = await runBenchmarkCli(argv);
      expect(exitCode).toBe(0);
      expect(fs.existsSync(jsonPath)).toBe(true);
      expect(fs.existsSync(mdPath)).toBe(true);
    } finally {
      if (fs.existsSync(dummyFile)) {
        fs.unlinkSync(dummyFile);
      }
    }
  }, 10000);

  it("returns exit code 1 when stage execution is blocked or failed", async () => {
    const oldKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const tmpDir = path.join(os.tmpdir(), "cli-fail-test-" + Date.now());
    const jsonPath = path.join(tmpDir, "report.json");
    const mdPath = path.join(tmpDir, "report.md");
    const dummyFile = path.join(tmpDir, "dummy_cli_fail.mp4");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    fs.writeFileSync(dummyFile, "dummy media content for test");

    try {
      const argv = [
        "node",
        "cloudCostBenchmark.ts",
        `--input=${dummyFile}`,
        "--stages=captions",
        "--provider-transcription=whisper", // missing key -> FAILED
        "--concurrency=1",
        "--iterations=1",
        "--warmup=0",
        `--output-json=${jsonPath}`,
        `--output-markdown=${mdPath}`,
      ];

      const exitCode = await runBenchmarkCli(argv);
      expect(exitCode).toBe(1);
    } finally {
      if (fs.existsSync(dummyFile)) {
        fs.unlinkSync(dummyFile);
      }
      if (oldKey) {
        process.env.OPENAI_API_KEY = oldKey;
      }
    }
  }, 10000);
});
