import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { parseCliArgs, runBenchmarkCli } from "../../cloudCostBenchmark";
import { DEFAULT_PRICING_MODELS, resolvePricingModel } from "../costCalculator";
import { BenchmarkOrchestrator } from "../orchestrator";
import { executeAvsStage } from "../providers";
import { generateMarkdownReport } from "../reporting";
import { TelemetryCollector } from "../telemetry";
import type { InputMediaMetadata, StageResult } from "../types";

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

    it("declares tsx in production dependencies for deterministic container execution", () => {
      const packageJsonPath = path.resolve(process.cwd(), "package.json");
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

      // tsx must be in dependencies so npm ci --omit=dev installs it into the container
      expect(packageJson.dependencies).toBeDefined();
      expect(packageJson.dependencies["tsx"]).toBeDefined();

      // tsx must NOT be in devDependencies
      if (packageJson.devDependencies) {
        expect(packageJson.devDependencies["tsx"]).toBeUndefined();
      }
    });
  });

  describe("2. CLI & Environment Precedence Hierarchy & Validation", () => {
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
        delete process.env.VOICESTUDIO_URL;
        process.env.VOICESTUDIO_API_URL = "http://legacy-host:3900";
        const parsedLegacy = parseCliArgs(["node", "cloudCostBenchmark.ts"]);
        expect(parsedLegacy.config.voiceStudioUrl).toBe("http://legacy-host:3900");

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

    it("throws actionable errors when invalid stages are passed to parseCliArgs", () => {
      expect(() => {
        parseCliArgs(["node", "cloudCostBenchmark.ts", "--stages=reframe,invalid_stage"]);
      }).toThrow(/Invalid stage\(s\): 'invalid_stage'/);
    });

    it("throws actionable errors when invalid provider values are passed to parseCliArgs", () => {
      expect(() => {
        parseCliArgs(["node", "cloudCostBenchmark.ts", "--provider-reframe=invalid"]);
      }).toThrow(/Invalid reframe provider: 'invalid'/);

      expect(() => {
        parseCliArgs(["node", "cloudCostBenchmark.ts", "--provider-avs=invalid"]);
      }).toThrow(/Invalid AVS provider: 'invalid'/);

      expect(() => {
        parseCliArgs(["node", "cloudCostBenchmark.ts", "--provider-transcription=invalid"]);
      }).toThrow(/Invalid transcription provider: 'invalid'/);

      expect(() => {
        parseCliArgs(["node", "cloudCostBenchmark.ts", "--provider-dubbing=invalid"]);
      }).toThrow(/Invalid dubbing provider: 'invalid'/);

      expect(() => {
        parseCliArgs(["node", "cloudCostBenchmark.ts", "--cloud=invalid"]);
      }).toThrow(/Invalid cloud provider: 'invalid'/);

      expect(() => {
        parseCliArgs(["node", "cloudCostBenchmark.ts", "--pricing-tier=invalid"]);
      }).toThrow(/Invalid pricing tier: 'invalid'/);
    });

    it("returns exit code 1 from runBenchmarkCli when invalid arguments are provided", async () => {
      const exitCode = await runBenchmarkCli([
        "node",
        "cloudCostBenchmark.ts",
        "--stages=invalid_foo",
      ]);
      expect(exitCode).toBe(1);
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
        process.env.TALKNET_SERVICE_URL = "http://127.0.0.1:59999/unreachable";

        const res = await executeAvsStage(dummyMedia, "talknet");
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

  describe("6. Hardware Provenance Separation & Schema 1.2.0 Formatting", () => {
    it("strictly separates actual execution environment from modeled pricing configuration", async () => {
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

      // Actual execution provider/instance is NOT inferred from user pricing choice!
      expect(report.provenance?.actualCloudProvider).toBeNull();
      expect(report.provenance?.actualInstanceType).toBeNull();

      // Modeled pricing is captured independently
      expect(report.provenance?.modeledPricing).toBeDefined();
      expect(report.provenance?.modeledPricing?.cloudProvider).toBe("aws");
      expect(report.provenance?.modeledPricing?.pricingTier).toBe("spot");
      expect(report.provenance?.modeledPricing?.instanceType).toContain("AWS EC2 g4dn.xlarge");

      // Backward-compatibility aliases work as modeled pricing
      expect(report.provenance?.cloudProvider).toBe("aws");
      expect(report.provenance?.pricingTier).toBe("spot");
      expect(report.provenance?.instanceType).toContain("AWS EC2 g4dn.xlarge");
    });

    it("labels fixture-mode throughput explicitly as N/A (fixture) rather than misleading physical throughput", async () => {
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
      const captionsStage = report.stages.captions;
      expect(captionsStage).not.toBeNull();
      expect(captionsStage?.status).toBe("fixture");
      expect(captionsStage?.throughputLabel).toBe("N/A (fixture)");

      const md = generateMarkdownReport(report);
      // Markdown table for captions must display N/A (fixture) in throughput column
      expect(md).toContain("| `captions` | `fixture` | fixture | 1/0 |");
      expect(md).toContain("N/A (fixture)");
    });

    it("formats Hardware Provenance section distinguishing actual telemetry from modeled pricing", async () => {
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
      expect(md).toContain("| **Host Execution Provider** | Unverified / Local Host |");
      expect(md).toContain("| **Host Instance Type** | Physical / Local Hardware |");
      expect(md).toContain("### 2.2 Modeled Cloud Pricing Configuration (Cost Model Only)");
      expect(md).toContain("| **Target Cloud Provider** | AWS |");
      expect(md).toContain("AWS EC2 g4dn.xlarge (T4 16GB) Spot");
    });
  });

  describe("7. GPU Verification Semantics & Provider Classification", () => {
    it("classifies pure fixture execution as fixture_simulation", async () => {
      const orchestrator = new BenchmarkOrchestrator({
        config: {
          stages: ["captions", "reframe"],
          concurrency: 1,
          iterations: 1,
          warmup: 0,
          gpuType: "T4",
          reframeProvider: "fixture",
          transcriptionProvider: "fixture",
          dubbingProvider: "fixture",
        },
        inputMedia: dummyMedia,
      });

      const report = await orchestrator.run();
      expect(report.provenance?.verificationStatus).toBe("fixture_simulation");
      expect(report.provenance?.verificationNotes?.[0]).toContain("Offline simulation");
    });

    it("classifies external API inference (e.g. Whisper/Groq) as external_api, even if host has an NVIDIA GPU", async () => {
      const orchestrator = new BenchmarkOrchestrator({
        config: {
          stages: ["captions"],
          concurrency: 1,
          iterations: 1,
          warmup: 0,
          gpuType: "T4",
          transcriptionProvider: "groq",
          dubbingProvider: "fixture",
        },
        inputMedia: dummyMedia,
      });

      // Mock runStage to simulate a live external API result
      const mockCaptionsResult: StageResult = {
        stage: "captions",
        status: "real_inference",
        provider: "groq",
        wallClockDurationMs: 500,
        warmupDurationMs: 0,
        iterations: 1,
        concurrency: 1,
        latency: {
          count: 1,
          p50Ms: 500,
          p95Ms: 500,
          minMs: 500,
          maxMs: 500,
          meanMs: 500,
          stdDevMs: 0,
          rawLatenciesMs: [500],
        },
        completedJobs: 1,
        failedJobs: 0,
        throughputJobsPerSec: 2,
        throughputLabel: "2 jobs/s",
        realtimeFactor: 20,
        realtimeFactorLabel: "20x",
        cost: {
          measuredComputeDurationSec: 0.5,
          computeCostUsd: 0.0001,
          externalApiCostUsd: 0.001,
          totalCostUsd: 0.0011,
          costPerCompletedJobUsd: 0.0011,
          costPerMinuteUsd: 0.006,
        },
      };

      // Spy on runStage
      orchestrator.runStage = async () => mockCaptionsResult;

      const report = await orchestrator.run();
      // External API must NEVER be classified as verified_gpu / verified_hardware!
      expect(report.provenance?.verificationStatus).toBe("external_api");
      expect(
        report.provenance?.verificationNotes?.some((n) => n.includes("external cloud APIs"))
      ).toBe(true);
    });

    it("classifies local CPU fallback as verified_cpu, even if host has an NVIDIA GPU", async () => {
      const orchestrator = new BenchmarkOrchestrator({
        config: {
          stages: ["dubbing"],
          concurrency: 1,
          iterations: 1,
          warmup: 0,
          gpuType: "T4",
          transcriptionProvider: "fixture",
          dubbingProvider: "voicestudio",
        },
        inputMedia: dummyMedia,
      });

      // Mock a local CPU inference result
      const mockDubbingCpuResult: StageResult = {
        stage: "dubbing",
        status: "real_inference",
        provider: "voicestudio",
        wallClockDurationMs: 1200,
        warmupDurationMs: 0,
        iterations: 1,
        concurrency: 1,
        latency: {
          count: 1,
          p50Ms: 1200,
          p95Ms: 1200,
          minMs: 1200,
          maxMs: 1200,
          meanMs: 1200,
          stdDevMs: 0,
          rawLatenciesMs: [1200],
        },
        completedJobs: 1,
        failedJobs: 0,
        throughputJobsPerSec: 0.8,
        throughputLabel: "0.8 jobs/s",
        realtimeFactor: 8.3,
        realtimeFactorLabel: "8.3x",
        cost: {
          measuredComputeDurationSec: 1.2,
          computeCostUsd: 0.0002,
          externalApiCostUsd: 0,
          totalCostUsd: 0.0002,
          costPerCompletedJobUsd: 0.0002,
          costPerMinuteUsd: 0.0012,
        },
        outputArtifacts: {
          device: "cpu",
          isGpu: false,
        },
      };

      orchestrator.runStage = async () => mockDubbingCpuResult;

      const report = await orchestrator.run();
      expect(report.provenance?.verificationStatus).toBe("verified_cpu");
      expect(
        report.provenance?.verificationNotes?.some(
          (n) => n.includes("CPU fallback") || n.includes("CPU")
        )
      ).toBe(true);
    });

    it("classifies live local GPU inference as verified_gpu when stage provides explicit GPU evidence", async () => {
      const orchestrator = new BenchmarkOrchestrator({
        config: {
          stages: ["dubbing"],
          concurrency: 1,
          iterations: 1,
          warmup: 0,
          gpuType: "T4",
          transcriptionProvider: "fixture",
          dubbingProvider: "voicestudio",
        },
        inputMedia: dummyMedia,
      });

      const mockDubbingGpuResult: StageResult = {
        stage: "dubbing",
        status: "real_inference",
        provider: "voicestudio",
        wallClockDurationMs: 300,
        warmupDurationMs: 0,
        iterations: 1,
        concurrency: 1,
        latency: {
          count: 1,
          p50Ms: 300,
          p95Ms: 300,
          minMs: 300,
          maxMs: 300,
          meanMs: 300,
          stdDevMs: 0,
          rawLatenciesMs: [300],
        },
        completedJobs: 1,
        failedJobs: 0,
        throughputJobsPerSec: 3.3,
        throughputLabel: "3.3 jobs/s",
        realtimeFactor: 33.3,
        realtimeFactorLabel: "33.3x",
        cost: {
          measuredComputeDurationSec: 0.3,
          computeCostUsd: 0.00005,
          externalApiCostUsd: 0,
          totalCostUsd: 0.00005,
          costPerCompletedJobUsd: 0.00005,
          costPerMinuteUsd: 0.0003,
        },
        outputArtifacts: {
          device: "cuda",
          isGpu: true,
        },
      };

      orchestrator.runStage = async () => mockDubbingGpuResult;

      const report = await orchestrator.run();
      // If host has GPU available, it is verified_gpu. If host has no GPU, verified_cpu.
      if (report.hardware.gpu?.isAvailable) {
        expect(report.provenance?.verificationStatus).toBe("verified_gpu");
        expect(
          report.provenance?.verificationNotes?.some((n) => n.includes("GPU execution verified"))
        ).toBe(true);
      } else {
        expect(report.provenance?.verificationStatus).toBe("verified_cpu");
      }
    });

    it("classifies execution as partially_verified when GPU is detected but stage provides no GPU evidence", async () => {
      const orchestrator = new BenchmarkOrchestrator({
        config: {
          stages: ["reframe"],
          concurrency: 1,
          iterations: 1,
          warmup: 0,
          gpuType: "T4",
          reframeProvider: "autoflip",
          transcriptionProvider: "fixture",
          dubbingProvider: "fixture",
        },
        inputMedia: dummyMedia,
      });

      const mockAmbiguousResult: StageResult = {
        stage: "reframe",
        status: "real_inference",
        provider: "autoflip",
        wallClockDurationMs: 400,
        warmupDurationMs: 0,
        iterations: 1,
        concurrency: 1,
        latency: {
          count: 1,
          p50Ms: 400,
          p95Ms: 400,
          minMs: 400,
          maxMs: 400,
          meanMs: 400,
          stdDevMs: 0,
          rawLatenciesMs: [400],
        },
        completedJobs: 1,
        failedJobs: 0,
        throughputJobsPerSec: 2.5,
        throughputLabel: "2.5 jobs/s",
        realtimeFactor: 25,
        realtimeFactorLabel: "25x",
        cost: {
          measuredComputeDurationSec: 0.4,
          computeCostUsd: 0.00008,
          externalApiCostUsd: 0,
          totalCostUsd: 0.00008,
          costPerCompletedJobUsd: 0.00008,
          costPerMinuteUsd: 0.00048,
        },
        // No device or isGpu artifact provided
        outputArtifacts: {
          cropTargetsCount: 5,
        },
      };

      orchestrator.runStage = async () => mockAmbiguousResult;

      const report = await orchestrator.run();
      if (report.hardware.gpu?.isAvailable) {
        expect(report.provenance?.verificationStatus).toBe("partially_verified");
        expect(
          report.provenance?.verificationNotes?.some((n) =>
            n.includes("no stage-attributed GPU execution evidence")
          )
        ).toBe(true);
      }
    });
  });
});
