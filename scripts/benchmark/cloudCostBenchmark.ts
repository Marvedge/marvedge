#!/usr/bin/env npx tsx
/**
 * scripts/benchmark/cloudCostBenchmark.ts
 * -----------------------------------------------------------------------------
 * Task-0102: End-to-End Cloud Cost Benchmark CLI
 *
 * Measures pipeline stages individually or end-to-end:
 *   1. Video reframing (AutoFlip / YuNet)
 *   2. Active speaker detection (TalkNet)
 *   3. Subtitle generation and burn-in (Whisper / ASS)
 *   4. Audio dubbing (ElevenLabs / Audio alignment)
 *
 * Features:
 *   � Telemetry: Latency (P50, P95, Max), CPU/RAM, and non-blocking nvidia-smi GPU polling
 *   � Cost Accounting: Compute rates (L4 @ $0.80/hr, T4 @ $0.35/hr, CPU @ $0.09/hr)
 *     and external provider API rates, per-job and per-minute
 *   � Offline Fixture Execution: Zero-cost, zero-network reproducible mode
 *   � Outputs: Structured JSON (schema 1.1.0) and human-readable Markdown reports
 *
 * Usage:
 *   npx tsx scripts/benchmark/cloudCostBenchmark.ts \
 *       --stages reframe,avs,captions,dubbing \
 *       --concurrency 1 \
 *       --iterations 3 \
 *       --warmup 1 \
 *       --output-json benchmark_results/cloud_cost_report.json \
 *       --output-markdown benchmark_results/cloud_cost_report.md
 */

import path from "path";
import { BenchmarkOrchestrator } from "./cloudCostBenchmark/orchestrator";
import { writeReports } from "./cloudCostBenchmark/reporting";
import { resolveOrGenerateInputMedia } from "./cloudCostBenchmark/syntheticMedia";
import type { BenchmarkConfig, PipelineStage } from "./cloudCostBenchmark/types";

export function parseCliArgs(argv: string[]): {
  config: BenchmarkConfig;
  outputJsonPath: string;
  outputMarkdownPath: string;
} {
  const args = argv.slice(2);

  // Defaults
  let inputVideoPath: string | undefined;
  let stages: PipelineStage[] = ["reframe", "avs", "captions", "dubbing"];
  let concurrency = 1;
  let iterations = 1;
  let warmup = 0;
  let gpuType: "L4" | "T4" | "custom" | "none" | "CPU" = "L4";
  let hourlyRateUsd: number | undefined;
  let reframeProvider: "fixture" | "autoflip" = "fixture";
  let avsProvider: "fixture" | "talknet" = "fixture";
  let transcriptionProvider: "fixture" | "whisper" | "groq" = "fixture";
  let dubbingProvider: "fixture" | "elevenlabs" | "voicestudio" = "fixture";
  let voiceStudioUrl: string | undefined = process.env.VOICESTUDIO_URL;
  let voiceStudioApiKey: string | undefined = process.env.VOICESTUDIO_API_KEY;
  let voiceStudioModel: string | undefined;
  let voiceStudioFallbackToPaid = false;
  let outputJsonPath = "benchmark_results/cloud_cost_report.json";
  let outputMarkdownPath = "benchmark_results/cloud_cost_report.md";
  let verbose = false;

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
    } else if (arg === "--gpu-type" && i + 1 < args.length) {
      gpuType = args[++i] as NonNullable<BenchmarkConfig["gpuType"]>;
    } else if (arg.startsWith("--gpu-type=")) {
      gpuType = arg.split("=")[1] as NonNullable<BenchmarkConfig["gpuType"]>;
    } else if (arg === "--hourly-rate" && i + 1 < args.length) {
      hourlyRateUsd = parseFloat(args[++i]) || undefined;
    } else if (arg.startsWith("--hourly-rate=")) {
      hourlyRateUsd = parseFloat(arg.split("=")[1]) || undefined;
    } else if (arg === "--provider-reframe" && i + 1 < args.length) {
      reframeProvider = args[++i] as NonNullable<BenchmarkConfig["reframeProvider"]>;
    } else if (arg.startsWith("--provider-reframe=")) {
      reframeProvider = arg.split("=")[1] as NonNullable<BenchmarkConfig["reframeProvider"]>;
    } else if (arg === "--provider-avs" && i + 1 < args.length) {
      avsProvider = args[++i] as NonNullable<BenchmarkConfig["avsProvider"]>;
    } else if (arg.startsWith("--provider-avs=")) {
      avsProvider = arg.split("=")[1] as NonNullable<BenchmarkConfig["avsProvider"]>;
    } else if (arg === "--provider-transcription" && i + 1 < args.length) {
      transcriptionProvider = args[++i] as NonNullable<BenchmarkConfig["transcriptionProvider"]>;
    } else if (arg.startsWith("--provider-transcription=")) {
      transcriptionProvider = arg.split("=")[1] as NonNullable<
        BenchmarkConfig["transcriptionProvider"]
      >;
    } else if (arg === "--provider-dubbing" && i + 1 < args.length) {
      dubbingProvider = args[++i] as NonNullable<BenchmarkConfig["dubbingProvider"]>;
    } else if (arg.startsWith("--provider-dubbing=")) {
      dubbingProvider = arg.split("=")[1] as NonNullable<BenchmarkConfig["dubbingProvider"]>;
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
  const valid: PipelineStage[] = ["reframe", "avs", "captions", "dubbing"];
  const parsed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is PipelineStage => valid.includes(s as PipelineStage));

  return parsed.length > 0 ? parsed : valid;
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
  --gpu-type <L4|T4|custom|none|CPU> Target compute hardware pricing (default: L4)
  --hourly-rate <usd>                Custom compute instance rate in $/hr
  --provider-reframe <mode>          Reframing provider: fixture | autoflip (default: fixture)
  --provider-avs <mode>              AVS provider: fixture | talknet (default: fixture)
  --provider-transcription <mode>    Transcription provider: fixture | whisper | groq (default: fixture)
  --provider-dubbing <mode>          Dubbing provider: fixture | elevenlabs (default: fixture)
  --output-json <path>               JSON report destination (default: benchmark_results/cloud_cost_report.json)
  --output-markdown <path>           Markdown report destination (default: benchmark_results/cloud_cost_report.md)
  --verbose                          Log detailed progress to terminal
  --help                             Display this help message
`);
  process.exit(0);
}

export async function runBenchmarkCli(argv: string[]): Promise<number> {
  const { config, outputJsonPath, outputMarkdownPath } = parseCliArgs(argv);

  console.log("================================================================");
  console.log("       MARVEDGE CLOUD COST BENCHMARK HARNESS (Task-0102)        ");
  console.log("================================================================");
  console.log(` Stages:       ${config.stages.join(", ")}`);
  console.log(` Concurrency:  ${config.concurrency}`);
  console.log(` Iterations:   ${config.iterations} (warmup: ${config.warmup})`);
  console.log(` GPU Model:    ${config.gpuType}`);
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
        `  � [${res.stage.padEnd(8)}] status=${res.status.padEnd(10)} p50=${res.latency.p50Ms}ms p95=${res.latency.p95Ms}ms throughput=${res.throughputJobsPerSec}jobs/s xRT=${res.realtimeFactorLabel} cost=$${res.cost.totalCostUsd.toFixed(6)}`
      );
    }

    if (report.endToEnd) {
      const e = report.endToEnd;
      console.log(
        `  � [E2E PIPE] status=${e.status.padEnd(10)} p50=${e.latency.p50Ms}ms p95=${e.latency.p95Ms}ms throughput=${e.throughputJobsPerSec}jobs/s xRT=${e.realtimeFactorLabel} cost=$${e.cost.totalCostUsd.toFixed(6)}`
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
