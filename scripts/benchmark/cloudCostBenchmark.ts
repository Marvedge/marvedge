#!/usr/bin/env npx tsx
/**
 * scripts/benchmark/cloudCostBenchmark.ts
 * -----------------------------------------------------------------------------
 * Task-00127: Portable End-to-End Cloud Cost Benchmark Runner
 *
 * Measures pipeline stages individually or end-to-end:
 *   1. Video reframing (AutoFlip / YuNet)
 *   2. Active speaker detection (TalkNet)
 *   3. Subtitle generation and burn-in (Whisper / ASS)
 *   4. Audio dubbing (ElevenLabs / VoiceStudio)
 *
 * Features:
 *   • Telemetry: Latency (P50, P95, Max), CPU/RAM, and non-blocking nvidia-smi GPU polling
 *   • Multi-Cloud Pricing: GCP (L4/T4), AWS g4dn.xlarge (Spot & On-Demand), Azure NCasT4_v3, CPU
 *   • Hardware Provenance: Detects containerization, runtime, driver, and records verification status
 *   • Offline Fixture Execution: Zero-cost, zero-network reproducible mode
 *   • Outputs: Structured JSON (Schema 1.2.0) and human-readable Markdown reports
 */

import path from "path";
import { BenchmarkOrchestrator } from "./cloudCostBenchmark/orchestrator";
import { writeReports } from "./cloudCostBenchmark/reporting";
import { resolveOrGenerateInputMedia } from "./cloudCostBenchmark/syntheticMedia";
import type {
  BenchmarkConfig,
  CloudProvider,
  PipelineStage,
  PricingTier,
} from "./cloudCostBenchmark/types";

export function parseCliArgs(argv: string[]): {
  config: BenchmarkConfig;
  outputJsonPath: string;
  outputMarkdownPath: string;
} {
  const args = argv.slice(2);

  // 1. Initial Defaults
  let inputVideoPath: string | undefined;
  let stages: PipelineStage[] = ["reframe", "avs", "captions", "dubbing"];
  let concurrency = 1;
  let iterations = 1;
  let warmup = 0;
  let gpuType = "L4";
  let hourlyRateUsd: number | undefined;
  let cloudProvider: CloudProvider | undefined;
  let pricingTier: PricingTier | undefined;
  let reframeProvider: "fixture" | "autoflip" = "fixture";
  let avsProvider: "fixture" | "talknet" = "fixture";
  let transcriptionProvider: "fixture" | "whisper" | "groq" = "fixture";
  let dubbingProvider: "fixture" | "elevenlabs" | "voicestudio" = "fixture";

  // VoiceStudio URL normalization: Canonical VOICESTUDIO_URL with VOICESTUDIO_API_URL fallback
  let voiceStudioUrl: string | undefined =
    process.env.VOICESTUDIO_URL || process.env.VOICESTUDIO_API_URL;
  let voiceStudioApiKey: string | undefined = process.env.VOICESTUDIO_API_KEY;
  let voiceStudioModel: string | undefined = process.env.VOICESTUDIO_MODEL;
  let voiceStudioFallbackToPaid = false;
  let outputJsonPath = "benchmark_results/cloud_cost_report.json";
  let outputMarkdownPath = "benchmark_results/cloud_cost_report.md";
  let verbose = false;

  // 2. Environment Variable Configuration (Precedence: CLI > ENV > Default)
  if (process.env.BENCHMARK_STAGES) {
    stages = parseStages(process.env.BENCHMARK_STAGES);
  }
  if (process.env.BENCHMARK_CONCURRENCY) {
    const val = parseInt(process.env.BENCHMARK_CONCURRENCY, 10);
    if (Number.isFinite(val) && val > 0) {
      concurrency = val;
    }
  }
  if (process.env.BENCHMARK_ITERATIONS) {
    const val = parseInt(process.env.BENCHMARK_ITERATIONS, 10);
    if (Number.isFinite(val) && val > 0) {
      iterations = val;
    }
  }
  if (process.env.BENCHMARK_WARMUP) {
    const val = parseInt(process.env.BENCHMARK_WARMUP, 10);
    if (Number.isFinite(val) && val >= 0) {
      warmup = val;
    }
  }
  if (process.env.BENCHMARK_GPU_TYPE) {
    gpuType = process.env.BENCHMARK_GPU_TYPE.trim();
  }
  if (process.env.BENCHMARK_HOURLY_RATE) {
    const val = parseFloat(process.env.BENCHMARK_HOURLY_RATE);
    if (Number.isFinite(val) && val >= 0) {
      hourlyRateUsd = val;
    }
  }
  if (process.env.BENCHMARK_CLOUD_PROVIDER) {
    const val = process.env.BENCHMARK_CLOUD_PROVIDER.trim().toLowerCase();
    if (["aws", "gcp", "azure", "local"].includes(val)) {
      cloudProvider = val as CloudProvider;
    }
  }
  if (process.env.BENCHMARK_PRICING_TIER) {
    const val = process.env.BENCHMARK_PRICING_TIER.trim().toLowerCase();
    if (["ondemand", "spot", "standard"].includes(val)) {
      pricingTier = val as PricingTier;
    }
  }

  // 3. Explicit CLI Arguments (Highest Precedence)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      printUsageAndExit();
    } else if (arg === "--input" && i + 1 < args.length) {
      inputVideoPath = args[++i];
    } else if (arg.startsWith("--input=")) {
      inputVideoPath = arg.split("=")[1];
    } else if (arg === "--stages" && i + 1 < args.length) {
      stages = parseStages(args[++i]);
    } else if (arg.startsWith("--stages=")) {
      stages = parseStages(arg.split("=")[1]);
    } else if (arg === "--concurrency" && i + 1 < args.length) {
      concurrency = Math.max(1, parseInt(args[++i], 10) || 1);
    } else if (arg.startsWith("--concurrency=")) {
      concurrency = Math.max(1, parseInt(arg.split("=")[1], 10) || 1);
    } else if (arg === "--iterations" && i + 1 < args.length) {
      iterations = Math.max(1, parseInt(args[++i], 10) || 1);
    } else if (arg.startsWith("--iterations=")) {
      iterations = Math.max(1, parseInt(arg.split("=")[1], 10) || 1);
    } else if (arg === "--warmup" && i + 1 < args.length) {
      warmup = Math.max(0, parseInt(args[++i], 10) || 0);
    } else if (arg.startsWith("--warmup=")) {
      warmup = Math.max(0, parseInt(arg.split("=")[1], 10) || 0);
    } else if ((arg === "--gpu-type" || arg === "--gpu") && i + 1 < args.length) {
      gpuType = args[++i];
    } else if (arg.startsWith("--gpu-type=")) {
      gpuType = arg.split("=")[1];
    } else if (arg.startsWith("--gpu=")) {
      gpuType = arg.split("=")[1];
    } else if ((arg === "--cloud" || arg === "--cloud-provider") && i + 1 < args.length) {
      const val = args[++i].toLowerCase();
      if (!["aws", "gcp", "azure", "local"].includes(val)) {
        throw new Error(
          `Invalid cloud provider: '${val}'. Valid options are: aws, gcp, azure, local.`
        );
      }
      cloudProvider = val as CloudProvider;
    } else if (arg.startsWith("--cloud=")) {
      const val = arg.split("=")[1].toLowerCase();
      if (!["aws", "gcp", "azure", "local"].includes(val)) {
        throw new Error(
          `Invalid cloud provider: '${val}'. Valid options are: aws, gcp, azure, local.`
        );
      }
      cloudProvider = val as CloudProvider;
    } else if (arg.startsWith("--cloud-provider=")) {
      const val = arg.split("=")[1].toLowerCase();
      if (!["aws", "gcp", "azure", "local"].includes(val)) {
        throw new Error(
          `Invalid cloud provider: '${val}'. Valid options are: aws, gcp, azure, local.`
        );
      }
      cloudProvider = val as CloudProvider;
    } else if (arg === "--pricing-tier" && i + 1 < args.length) {
      const val = args[++i].toLowerCase();
      if (!["ondemand", "spot", "standard"].includes(val)) {
        throw new Error(
          `Invalid pricing tier: '${val}'. Valid options are: ondemand, spot, standard.`
        );
      }
      pricingTier = val as PricingTier;
    } else if (arg.startsWith("--pricing-tier=")) {
      const val = arg.split("=")[1].toLowerCase();
      if (!["ondemand", "spot", "standard"].includes(val)) {
        throw new Error(
          `Invalid pricing tier: '${val}'. Valid options are: ondemand, spot, standard.`
        );
      }
      pricingTier = val as PricingTier;
    } else if (arg === "--hourly-rate" && i + 1 < args.length) {
      hourlyRateUsd = parseFloat(args[++i]) || undefined;
    } else if (arg.startsWith("--hourly-rate=")) {
      hourlyRateUsd = parseFloat(arg.split("=")[1]) || undefined;
    } else if (arg === "--provider-reframe" && i + 1 < args.length) {
      const val = args[++i];
      if (!["fixture", "autoflip"].includes(val)) {
        throw new Error(
          `Invalid reframe provider: '${val}'. Valid options are: fixture, autoflip.`
        );
      }
      reframeProvider = val as NonNullable<BenchmarkConfig["reframeProvider"]>;
    } else if (arg.startsWith("--provider-reframe=")) {
      const val = arg.split("=")[1];
      if (!["fixture", "autoflip"].includes(val)) {
        throw new Error(
          `Invalid reframe provider: '${val}'. Valid options are: fixture, autoflip.`
        );
      }
      reframeProvider = val as NonNullable<BenchmarkConfig["reframeProvider"]>;
    } else if (arg === "--provider-avs" && i + 1 < args.length) {
      const val = args[++i];
      if (!["fixture", "talknet"].includes(val)) {
        throw new Error(`Invalid AVS provider: '${val}'. Valid options are: fixture, talknet.`);
      }
      avsProvider = val as NonNullable<BenchmarkConfig["avsProvider"]>;
    } else if (arg.startsWith("--provider-avs=")) {
      const val = arg.split("=")[1];
      if (!["fixture", "talknet"].includes(val)) {
        throw new Error(`Invalid AVS provider: '${val}'. Valid options are: fixture, talknet.`);
      }
      avsProvider = val as NonNullable<BenchmarkConfig["avsProvider"]>;
    } else if (arg === "--provider-transcription" && i + 1 < args.length) {
      const val = args[++i];
      if (!["fixture", "whisper", "groq"].includes(val)) {
        throw new Error(
          `Invalid transcription provider: '${val}'. Valid options are: fixture, whisper, groq.`
        );
      }
      transcriptionProvider = val as NonNullable<BenchmarkConfig["transcriptionProvider"]>;
    } else if (arg.startsWith("--provider-transcription=")) {
      const val = arg.split("=")[1];
      if (!["fixture", "whisper", "groq"].includes(val)) {
        throw new Error(
          `Invalid transcription provider: '${val}'. Valid options are: fixture, whisper, groq.`
        );
      }
      transcriptionProvider = val as NonNullable<BenchmarkConfig["transcriptionProvider"]>;
    } else if (arg === "--provider-dubbing" && i + 1 < args.length) {
      const val = args[++i];
      if (!["fixture", "elevenlabs", "voicestudio"].includes(val)) {
        throw new Error(
          `Invalid dubbing provider: '${val}'. Valid options are: fixture, elevenlabs, voicestudio.`
        );
      }
      dubbingProvider = val as NonNullable<BenchmarkConfig["dubbingProvider"]>;
    } else if (arg.startsWith("--provider-dubbing=")) {
      const val = arg.split("=")[1];
      if (!["fixture", "elevenlabs", "voicestudio"].includes(val)) {
        throw new Error(
          `Invalid dubbing provider: '${val}'. Valid options are: fixture, elevenlabs, voicestudio.`
        );
      }
      dubbingProvider = val as NonNullable<BenchmarkConfig["dubbingProvider"]>;
    } else if (arg === "--voicestudio-url" && i + 1 < args.length) {
      voiceStudioUrl = args[++i];
    } else if (arg.startsWith("--voicestudio-url=")) {
      voiceStudioUrl = arg.split("=")[1];
    } else if (arg === "--voicestudio-api-key" && i + 1 < args.length) {
      voiceStudioApiKey = args[++i];
    } else if (arg.startsWith("--voicestudio-api-key=")) {
      voiceStudioApiKey = arg.split("=")[1];
    } else if (arg === "--voicestudio-model" && i + 1 < args.length) {
      voiceStudioModel = args[++i];
    } else if (arg.startsWith("--voicestudio-model=")) {
      voiceStudioModel = arg.split("=")[1];
    } else if (arg === "--voicestudio-fallback-to-paid") {
      voiceStudioFallbackToPaid = true;
    } else if (arg === "--output-json" && i + 1 < args.length) {
      outputJsonPath = args[++i];
    } else if (arg.startsWith("--output-json=")) {
      outputJsonPath = arg.split("=")[1];
    } else if (arg === "--output-markdown" && i + 1 < args.length) {
      outputMarkdownPath = args[++i];
    } else if (arg.startsWith("--output-markdown=")) {
      outputMarkdownPath = arg.split("=")[1];
    } else if (arg === "--verbose") {
      verbose = true;
    }
  }

  return {
    config: {
      inputVideoPath,
      stages,
      concurrency,
      iterations,
      warmup,
      gpuType,
      cloudProvider,
      pricingTier,
      hourlyRateUsd,
      reframeProvider,
      avsProvider,
      transcriptionProvider,
      dubbingProvider,
      voiceStudioUrl,
      voiceStudioApiKey,
      voiceStudioModel,
      voiceStudioFallbackToPaid,
      outputJsonPath,
      outputMarkdownPath,
      verbose,
    },
    outputJsonPath,
    outputMarkdownPath,
  };
}

function parseStages(raw: string): PipelineStage[] {
  if (raw.toLowerCase() === "all") {
    return ["reframe", "avs", "captions", "dubbing"];
  }
  const validStages: PipelineStage[] = ["reframe", "avs", "captions", "dubbing"];
  const tokens = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const invalid = tokens.filter((t) => !validStages.includes(t as PipelineStage));
  if (invalid.length > 0) {
    throw new Error(
      `Invalid stage(s): ${invalid.map((s) => `'${s}'`).join(", ")}. Valid stages are: reframe, avs, captions, dubbing (or 'all').`
    );
  }

  return tokens as PipelineStage[];
}

function printUsageAndExit(): never {
  console.log(`
Usage: npx tsx scripts/benchmark/cloudCostBenchmark.ts [options]

Options:
  --input <path>                     Source video path (default: generates synthetic 5s clip)
  --stages <list>                    Comma-separated stages: reframe,avs,captions,dubbing (or "all")
  --concurrency <N>                  Parallel jobs (default: 1)
  --iterations <N>                   Measured iterations per stage (default: 1)
  --warmup <N>                       Warmup iterations (default: 0)
  --gpu, --gpu-type <type>           Target compute hardware pricing: L4, T4, CPU, custom (default: L4)
  --cloud, --cloud-provider <c>      Target cloud provider: aws, gcp, azure, local
  --pricing-tier <tier>              Target pricing tier: ondemand, spot, standard
  --hourly-rate <usd>                Custom compute instance rate in $/hr
  --provider-reframe <mode>          Reframing provider: fixture | autoflip (default: fixture)
  --provider-avs <mode>              AVS provider: fixture | talknet (default: fixture)
  --provider-transcription <mode>    Transcription provider: fixture | whisper | groq (default: fixture)
  --provider-dubbing <mode>          Dubbing provider: fixture | elevenlabs | voicestudio (default: fixture)
  --voicestudio-url <url>            VoiceStudio API endpoint (default: http://127.0.0.1:3900)
  --output-json <path>               JSON report destination (default: benchmark_results/cloud_cost_report.json)
  --output-markdown <path>           Markdown report destination (default: benchmark_results/cloud_cost_report.md)
  --verbose                          Log detailed progress to terminal
  --help                             Display this help message

Environment Variables:
  BENCHMARK_STAGES                   Comma-separated stages list
  BENCHMARK_CONCURRENCY              Concurrency integer
  BENCHMARK_ITERATIONS               Measured iterations count
  BENCHMARK_WARMUP                   Warmup iterations count
  BENCHMARK_GPU_TYPE                 Target GPU type (L4, T4, CPU)
  BENCHMARK_CLOUD_PROVIDER           Target cloud provider (aws, gcp, azure, local)
  BENCHMARK_PRICING_TIER             Target pricing tier (ondemand, spot, standard)
  BENCHMARK_HOURLY_RATE              Custom hourly rate override in USD
  VOICESTUDIO_URL, VOICESTUDIO_API_URL  Canonical endpoint for VoiceStudio service
`);
  process.exit(0);
}

export async function runBenchmarkCli(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseCliArgs(argv);
  } catch (err: unknown) {
    console.error(`\n[CLI ERROR]: ${(err as Error).message}\n`);
    return 1;
  }
  const { config, outputJsonPath, outputMarkdownPath } = parsed;

  console.log("================================================================");
  console.log("       MARVEDGE CLOUD COST BENCHMARK HARNESS (Task-0127)        ");
  console.log("================================================================");
  console.log(` Stages:       ${config.stages.join(", ")}`);
  console.log(` Concurrency:  ${config.concurrency}`);
  console.log(` Iterations:   ${config.iterations} (warmup: ${config.warmup})`);
  console.log(
    ` Compute:      GPU=${config.gpuType} | Cloud=${config.cloudProvider || "default"} | Tier=${
      config.pricingTier || "standard"
    }`
  );
  console.log(
    ` Providers:    reframe=${config.reframeProvider}, avs=${config.avsProvider}, transcription=${config.transcriptionProvider}, dubbing=${config.dubbingProvider}`
  );

  // Resolve media (synthetic or real)
  const { media, cleanup } = resolveOrGenerateInputMedia(config.inputVideoPath);
  console.log(
    ` Input Media:  ${path.basename(media.path)} (${media.durationSec}s, synthetic: ${media.isSynthetic})`
  );
  console.log("----------------------------------------------------------------\n");

  try {
    const orchestrator = new BenchmarkOrchestrator({
      config,
      inputMedia: media,
    });

    console.log("Running benchmark suite...");
    const report = await orchestrator.run();

    // Write reports
    const written = writeReports(report, outputJsonPath, outputMarkdownPath);

    console.log("\n================================================================");
    console.log("                      BENCHMARK RESULTS                         ");
    console.log("================================================================");
    console.log(` Overall Status:        ${report.summary.overallStatus}`);
    console.log(` Verification:          ${report.provenance?.verificationStatus || "unknown"}`);
    console.log(
      ` Environment:           ${report.provenance?.executionEnvironment || "bare-metal"}`
    );
    console.log(` Total Wall-Clock:      ${(report.totalDurationMs / 1000).toFixed(2)} s`);
    console.log(` Total Warmup:          ${(report.totalWarmupDurationMs / 1000).toFixed(2)} s`);
    console.log(` Total Estimated Cost:  $${report.summary.totalCostUsd.toFixed(6)} USD`);
    if (report.summary.costPerCompletedJobUsd !== null) {
      console.log(
        ` Cost / Completed Job:  $${report.summary.costPerCompletedJobUsd.toFixed(6)} USD/job`
      );
    }
    if (report.summary.totalCostPerMinuteUsd !== null) {
      console.log(
        ` Cost / Media Minute:   $${report.summary.totalCostPerMinuteUsd.toFixed(6)} USD/min`
      );
    }

    console.log("\nStage Breakdown:");
    for (const res of Object.values(report.stages)) {
      if (!res) {
        continue;
      }
      console.log(
        `  • [${res.stage.padEnd(8)}] status=${res.status.padEnd(10)} p50=${res.latency.p50Ms}ms p95=${res.latency.p95Ms}ms throughput=${res.throughputJobsPerSec}jobs/s xRT=${res.realtimeFactorLabel} cost=$${res.cost.totalCostUsd.toFixed(6)}`
      );
    }

    if (report.endToEnd) {
      const e = report.endToEnd;
      console.log(
        `  • [E2E PIPE] status=${e.status.padEnd(10)} p50=${e.latency.p50Ms}ms p95=${e.latency.p95Ms}ms throughput=${e.throughputJobsPerSec}jobs/s xRT=${e.realtimeFactorLabel} cost=$${e.cost.totalCostUsd.toFixed(6)}`
      );
    }

    console.log("\nOutput Artifacts:");
    if (written.jsonWrittenTo) {
      console.log(`  JSON Report:     ${written.jsonWrittenTo}`);
    }
    if (written.markdownWrittenTo) {
      console.log(`  Markdown Report: ${written.markdownWrittenTo}`);
    }
    console.log("================================================================\n");

    // Exit code semantics: Non-zero exit code on benchmark total failure
    if (report.summary.overallStatus === "FAILED") {
      return 1;
    }
    return 0;
  } finally {
    cleanup();
  }
}

if (require.main === module || process.argv[1]?.endsWith("cloudCostBenchmark.ts")) {
  runBenchmarkCli(process.argv)
    .then((exitCode) => {
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    })
    .catch((err) => {
      console.error("Benchmark failed with error:", err);
      process.exit(1);
    });
}
