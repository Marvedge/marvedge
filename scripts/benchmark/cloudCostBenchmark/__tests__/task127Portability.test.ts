import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../../cloudCostBenchmark";
import { DEFAULT_PRICING_MODELS, resolvePricingModel } from "../costCalculator";
import { BenchmarkOrchestrator } from "../orchestrator";
import { executeAvsStage } from "../providers";
import { generateMarkdownReport } from "../reporting";
import { TelemetryCollector } from "../telemetry";
import type { InputMediaMetadata } from "../types";

describe("Task-00127: Portable Multi-Cloud Benchmark & Hardware Provenance", () => {
  const dummyMedia: InputMediaMetadata = {
    path: "/dummy/clip.mp4",
    durationSec: 10,
    fileSizeBytes: 1024 * 1024,
    isSynthetic: true,
  };

  describe("1. Docker Configuration & Container Portability", () => {
    it("ensures .dockerignore exists and excludes sensitive and ephemeral files", () => {
      const dockerignorePath = path.resolve(process.cwd(), ".dockerignore");
      expect(fs.existsSync(dockerignorePath)).toBe(true);

      const content = fs.readFileSync(dockerignorePath, "utf-8");
      const lines = content
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"));

      expect(lines).toContain("node_modules");
      expect(lines).toContain(".git");
      expect(lines).toContain(".next");
      expect(lines).toContain("dist");
      expect(lines).toContain("coverage");
      expect(lines).toContain("benchmark_results");
      expect(lines.some((l) => l.includes(".env"))).toBe(true);
      expect(lines.some((l) => l.includes("__pycache__"))).toBe(true);
    });

    it("ensures Dockerfile.benchmark pins immutable node digest and required system tools", () => {
      const dockerfilePath = path.resolve(process.cwd(), "Dockerfile.benchmark");
      expect(fs.existsSync(dockerfilePath)).toBe(true);

      const content = fs.readFileSync(dockerfilePath, "utf-8");
      // Must pin immutable digest
      expect(content).toContain("node:20.18.0-slim@sha256:");
      // Must install ffmpeg, procps, ca-certificates
      expect(content).toContain("ffmpeg");
      expect(content).toContain("procps");
      expect(content).toContain("ca-certificates");
      // Must run npm ci --omit=dev
      expect(content).toContain("npm ci --omit=dev");
      // Must set path or have VOLUME
      expect(content).toContain('VOLUME ["/app/benchmark_results"]');
    });
  });

  describe("2. CLI & Environment Precedence Hierarchy", () => {
    it("treats --gpu and --gpu-type as identical aliases", () => {
      const parsedWithGpuType = parseCliArgs(["node", "cloudCostBenchmark.ts", "--gpu-type=T4"]);
      const parsedWithGpu = parseCliArgs(["node", "cloudCostBenchmark.ts", "--gpu=T4"]);

      expect(parsedWithGpuType.config.gpuType).toBe("T4");
      expect(parsedWithGpu.config.gpuType).toBe("T4");
      expect(parsedWithGpu.config.gpuType).toBe(parsedWithGpuType.config.gpuType);
    });

    it("parses multi-cloud provider and pricing tier CLI arguments", () => {
      const parsed = parseCliArgs([
        "node",
        "cloudCostBenchmark.ts",
        "--cloud=aws",
        "--pricing-tier=spot",
      ]);

      expect(parsed.config.cloudProvider).toBe("aws");
      expect(parsed.config.pricingTier).toBe("spot");

      const parsedLong = parseCliArgs([
        "node",
        "cloudCostBenchmark.ts",
        "--cloud-provider=gcp",
        "--pricing-tier=ondemand",
      ]);

      expect(parsedLong.config.cloudProvider).toBe("gcp");
      expect(parsedLong.config.pricingTier).toBe("ondemand");
    });

    it("enforces precedence: CLI arguments override environment variables", () => {
      const origGpu = process.env.BENCHMARK_GPU_TYPE;
      const origConcurrency = process.env.BENCHMARK_CONCURRENCY;
      const origCloud = process.env.BENCHMARK_CLOUD_PROVIDER;

      try {
        process.env.BENCHMARK_GPU_TYPE = "T4";
        process.env.BENCHMARK_CONCURRENCY = "2";
        process.env.BENCHMARK_CLOUD_PROVIDER = "aws";

        const parsed = parseCliArgs([
          "node",
          "cloudCostBenchmark.ts",
          "--gpu=L4",
          "--concurrency=8",
          "--cloud=gcp",
        ]);

        expect(parsed.config.gpuType).toBe("L4");
        expect(parsed.config.concurrency).toBe(8);
        expect(parsed.config.cloudProvider).toBe("gcp");
      } finally {
        if (origGpu !== undefined) process.env.BENCHMARK_GPU_TYPE = origGpu;
        else delete process.env.BENCHMARK_GPU_TYPE;

        if (origConcurrency !== undefined) process.env.BENCHMARK_CONCURRENCY = origConcurrency;
        else delete process.env.BENCHMARK_CONCURRENCY;

        if (origCloud !== undefined) process.env.BENCHMARK_CLOUD_PROVIDER = origCloud;
        else delete process.env.BENCHMARK_CLOUD_PROVIDER;
      }
    });

    it("falls back to environment variables when CLI arguments are omitted", () => {
      const origGpu = process.env.BENCHMARK_GPU_TYPE;
      const origIterations = process.env.BENCHMARK_ITERATIONS;
      const origTier = process.env.BENCHMARK_PRICING_TIER;

      try {
        process.env.BENCHMARK_GPU_TYPE = "T4";
        process.env.BENCHMARK_ITERATIONS = "7";
        process.env.BENCHMARK_PRICING_TIER = "spot";

        const parsed = parseCliArgs(["node", "cloudCostBenchmark.ts"]);

        expect(parsed.config.gpuType).toBe("T4");
        expect(parsed.config.iterations).toBe(7);
        expect(parsed.config.pricingTier).toBe("spot");
      } finally {
        if (origGpu !== undefined) process.env.BENCHMARK_GPU_TYPE = origGpu;
        else delete process.env.BENCHMARK_GPU_TYPE;

        if (origIterations !== undefined) process.env.BENCHMARK_ITERATIONS = origIterations;
        else delete process.env.BENCHMARK_ITERATIONS;

        if (origTier !== undefined) process.env.BENCHMARK_PRICING_TIER = origTier;
        else delete process.env.BENCHMARK_PRICING_TIER;
      }
    });

    it("resolves canonical VOICESTUDIO_URL with backward-compatible VOICESTUDIO_API_URL fallback", () => {
      const origUrl = process.env.VOICESTUDIO_URL;
      const origApiUrl = process.env.VOICESTUDIO_API_URL;

      try {
        // When only VOICESTUDIO_API_URL is set
        delete process.env.VOICESTUDIO_URL;
        process.env.VOICESTUDIO_API_URL = "http://legacy-host:3900";
        const parsedLegacy = parseCliArgs(["node", "cloudCostBenchmark.ts"]);
        expect(parsedLegacy.config.voiceStudioUrl).toBe("http://legacy-host:3900");

        // When VOICESTUDIO_URL is set, it takes precedence
        process.env.VOICESTUDIO_URL = "http://canonical-host:3900";
        const parsedCanonical = parseCliArgs(["node", "cloudCostBenchmark.ts"]);
        expect(parsedCanonical.config.voiceStudioUrl).toBe("http://canonical-host:3900");
      } finally {
        if (origUrl !== undefined) process.env.VOICESTUDIO_URL = origUrl;
        else delete process.env.VOICESTUDIO_URL;

        if (origApiUrl !== undefined) process.env.VOICESTUDIO_API_URL = origApiUrl;
        else delete process.env.VOICESTUDIO_API_URL;
      }
    });
  });

  describe("3. Multi-Cloud Pricing Resolution", () => {
    it("resolves AWS g4dn.xlarge On-Demand and Spot pricing correctly", () => {
      const awsOnDemand = resolvePricingModel("T4", {
        cloudProvider: "aws",
        pricingTier: "ondemand",
      });
      expect(awsOnDemand.cloudProvider).toBe("aws");
      expect(awsOnDemand.pricingTier).toBe("ondemand");
      expect(awsOnDemand.computeHourlyRateUsd).toBe(0.7104);
      expect(awsOnDemand.instanceType).toContain("AWS EC2 g4dn.xlarge");

      const awsSpot = resolvePricingModel("T4", {
        cloudProvider: "aws",
        pricingTier: "spot",
      });
      expect(awsSpot.cloudProvider).toBe("aws");
      expect(awsSpot.pricingTier).toBe("spot");
      expect(awsSpot.computeHourlyRateUsd).toBe(0.22);
    });

    it("resolves GCP L4 and T4 pricing correctly", () => {
      const gcpL4 = resolvePricingModel("L4", { cloudProvider: "gcp" });
      expect(gcpL4.cloudProvider).toBe("gcp");
      expect(gcpL4.computeHourlyRateUsd).toBe(0.8);
      expect(gcpL4.instanceType).toContain("L4");

      const gcpT4 = resolvePricingModel("T4", { cloudProvider: "gcp" });
      expect(gcpT4.cloudProvider).toBe("gcp");
      expect(gcpT4.computeHourlyRateUsd).toBe(0.35);
      expect(gcpT4.instanceType).toContain("T4");
    });

    it("resolves Azure NCasT4_v3 pricing correctly", () => {
      const azure = resolvePricingModel("T4", { cloudProvider: "azure" });
      expect(azure.cloudProvider).toBe("azure");
      expect(azure.computeHourlyRateUsd).toBe(0.526);
      expect(azure.instanceType).toContain("Standard_NC4as_T4_v3");
    });

    it("resolves generic CPU baseline pricing correctly", () => {
      const cpu = resolvePricingModel("CPU");
      expect(cpu.computeHourlyRateUsd).toBe(0.09);
      expect(cpu.instanceType).toContain("CPU");
    });

    it("allows explicit hourly rate override regardless of provider", () => {
      const customRate = resolvePricingModel("T4", {
        cloudProvider: "aws",
        computeHourlyRateUsd: 0.185,
      });
      expect(customRate.cloudProvider).toBe("aws");
      expect(customRate.computeHourlyRateUsd).toBe(0.185);
      expect(customRate.computeIsAssumption).toBe(false);
    });
  });

  describe("4. Provider Decoupling & Remote Preflight", () => {
    it("blocks local AVS when weights are missing without attempting downloads", async () => {
      const oldTalknetUrl = process.env.TALKNET_SERVICE_URL;
      const oldGwUrl = process.env.ML_GATEWAY_URL;

      try {
        delete process.env.TALKNET_SERVICE_URL;
        delete process.env.ML_GATEWAY_URL;

        const res = await executeAvsStage(dummyMedia, "talknet");
        expect(res.status).toBe("blocked");
        expect(res.error).toBe("TALKNET_WEIGHTS_MISSING");
        expect(
          res.notes.some((n) => n.includes("Automatic model weight download is disabled"))
        ).toBe(true);
      } finally {
        if (oldTalknetUrl) process.env.TALKNET_SERVICE_URL = oldTalknetUrl;
        if (oldGwUrl) process.env.ML_GATEWAY_URL = oldGwUrl;
      }
    });

    it("does NOT block on local disk weights when remote service URL is configured", async () => {
      const oldTalknetUrl = process.env.TALKNET_SERVICE_URL;

      try {
        // Point to an unreachable mock endpoint
        process.env.TALKNET_SERVICE_URL = "http://127.0.0.1:59999/unreachable";

        const res = await executeAvsStage(dummyMedia, "talknet");
        // Preflight passes weights check, fails at connection/network step rather than weights
        expect(res.error).not.toBe("TALKNET_WEIGHTS_MISSING");
      } finally {
        if (oldTalknetUrl) process.env.TALKNET_SERVICE_URL = oldTalknetUrl;
        else delete process.env.TALKNET_SERVICE_URL;
      }
    });
  });

  describe("5. Telemetry & Hardware Detection Methods", () => {
    it("reports containerization status as a boolean", () => {
      const collector = new TelemetryCollector();
      const isContainer = collector.isContainerized();
      expect(typeof isContainer).toBe("boolean");
    });

    it("retrieves python and docker versions gracefully without throwing", () => {
      const collector = new TelemetryCollector();
      const pyVer = collector.getPythonVersion();
      expect(pyVer === null || typeof pyVer === "string").toBe(true);

      const dockerVer = collector.getDockerVersion();
      expect(dockerVer === null || typeof dockerVer === "string").toBe(true);
    });
  });

  describe("6. Hardware Provenance & Schema 1.2.0 Formatting", () => {
    it("produces Schema 1.2.0 report with fixture_simulation provenance", async () => {
      const orchestrator = new BenchmarkOrchestrator({
        config: {
          stages: ["captions"],
          concurrency: 1,
          iterations: 1,
          warmup: 0,
          gpuType: "T4",
          cloudProvider: "aws",
          pricingTier: "spot",
          transcriptionProvider: "fixture",
          dubbingProvider: "fixture",
        },
        inputMedia: dummyMedia,
      });

      const report = await orchestrator.run();

      expect(report.schemaVersion).toBe("1.2.0");
      expect(report.provenance).toBeDefined();
      expect(report.provenance?.verificationStatus).toBe("fixture_simulation");
      expect(report.provenance?.cloudProvider).toBe("aws");
      expect(report.provenance?.pricingTier).toBe("spot");
      expect(report.provenance?.instanceType).toContain("AWS EC2 g4dn.xlarge");
      expect(typeof report.provenance?.containerized).toBe("boolean");
      expect(report.provenance?.executionEnvironment).toBeDefined();
    });

    it("formats Hardware Provenance section in Markdown report correctly", async () => {
      const orchestrator = new BenchmarkOrchestrator({
        config: {
          stages: ["captions"],
          concurrency: 1,
          iterations: 1,
          warmup: 0,
          gpuType: "T4",
          cloudProvider: "aws",
          pricingTier: "spot",
          transcriptionProvider: "fixture",
          dubbingProvider: "fixture",
        },
        inputMedia: dummyMedia,
      });

      const report = await orchestrator.run();
      const md = generateMarkdownReport(report);

      expect(md).toContain("## 2. Hardware & Environment Telemetry");
      expect(md).toContain("**Hardware Provenance & Classification:** `FIXTURE_SIMULATION`");
      expect(md).toContain("AWS EC2 g4dn.xlarge (T4 16GB) Spot");
      expect(md).toContain("Rate: $0.22/hr");
    });
  });
});
