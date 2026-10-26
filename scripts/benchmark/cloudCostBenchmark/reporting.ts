/**
 * Task-0102: JSON & Markdown Benchmark Report Generator
 * Formats structured JSON (Schema 1.1.0) and human-readable Markdown reports.
 */

import fs from "fs";
import path from "path";
import type { BenchmarkRunReport, PipelineStage } from "./types";

export function generateJsonReport(report: BenchmarkRunReport): string {
  return JSON.stringify(report, null, 2);
}

export function generateMarkdownReport(report: BenchmarkRunReport): string {
  const { config, hardware, inputMedia, pricing, stages, endToEnd, summary } = report;

  const lines: string[] = [];

  lines.push("# Cloud Cost Benchmark Report � Task-0102");
  lines.push("");
  lines.push(`**Generated:** ${report.timestamp}  `);
  lines.push(`**Schema Version:** ${report.schemaVersion}  `);
  lines.push(`**Overall Status:** ${summary.overallStatus}  `);
  lines.push(
    `**Input Media:** \`${path.basename(inputMedia.path)}\` (${inputMedia.durationSec}s, ${(inputMedia.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB, synthetic: ${inputMedia.isSynthetic})  `
  );
  lines.push(
    `**Execution Mode:** Concurrency ${config.concurrency} | Iterations ${config.iterations} | Warmup ${config.warmup}  `
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  // Executive Summary
  lines.push("## 1. Executive Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| :--- | :--- |");
  lines.push(
    `| **Total Benchmark Wall-Clock** | ${(report.totalDurationMs / 1000).toFixed(2)} s |`
  );
  lines.push(
    `| **Total Warm-up Duration** | ${(report.totalWarmupDurationMs / 1000).toFixed(2)} s (reported separately) |`
  );
  lines.push(`| **Total Estimated Cost** | **$${summary.totalCostUsd.toFixed(6)} USD** |`);
  lines.push(
    `| **Cost per Completed Job** | **${summary.costPerCompletedJobUsd !== null ? `$${summary.costPerCompletedJobUsd.toFixed(6)} USD/job` : "N/A"}** |`
  );
  lines.push(
    `| **Cost per Media Minute** | **${summary.totalCostPerMinuteUsd !== null ? `$${summary.totalCostPerMinuteUsd.toFixed(6)} USD/min` : "N/A"}** |`
  );
  lines.push(`| **Overall Status** | **${summary.overallStatus}** |`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Hardware Telemetry
  lines.push("## 2. Hardware & Environment Telemetry");
  lines.push("");
  lines.push("| Subsystem | Parameter | Measured Value |");
  lines.push("| :--- | :--- | :--- |");
  lines.push(
    `| **OS & Runtime** | Platform & Arch | ${hardware.os.platform} (${hardware.os.arch}) |`
  );
  lines.push(
    `| | Node.js / V8 | ${hardware.runtime.nodeVersion} / ${hardware.runtime.v8Version} |`
  );
  lines.push(`| **CPU** | Processor Model | ${hardware.cpu.model} |`);
  lines.push(`| | Cores Count | ${hardware.cpu.cores} vCPUs |`);
  lines.push(
    `| | Avg / Peak Utilization | ${hardware.cpu.avgUtilizationPct ?? "N/A"}% / ${hardware.cpu.peakUtilizationPct ?? "N/A"}% |`
  );
  lines.push(
    `| **Memory** | System Total / Free | ${(hardware.memory.totalBytes / 1e9).toFixed(2)} GB / ${(hardware.memory.freeBytes / 1e9).toFixed(2)} GB |`
  );
  lines.push(
    `| | Process Peak RSS | ${(hardware.memory.processPeakRssBytes / (1024 * 1024)).toFixed(1)} MB |`
  );

  if (hardware.gpu?.isAvailable) {
    lines.push(`| **GPU** | Model | ${hardware.gpu.modelName ?? "Unknown NVIDIA GPU"} |`);
    lines.push(
      `| | Driver / CUDA | ${hardware.gpu.driverVersion ?? "N/A"} / ${hardware.gpu.cudaVersion ?? "N/A"} |`
    );
    lines.push(`| | Total VRAM | ${hardware.gpu.totalVramMib ?? "N/A"} MiB |`);
    lines.push(`| | Peak VRAM Used | ${hardware.gpu.peakVramUsedMib ?? "N/A"} MiB |`);
    lines.push(
      `| | Avg / Peak GPU Util | ${hardware.gpu.avgGpuUtilPct ?? "N/A"}% / ${hardware.gpu.peakGpuUtilPct ?? "N/A"}% |`
    );
    lines.push(`| | Max Temperature | ${hardware.gpu.maxTempC ?? "N/A"} �C |`);
  } else {
    lines.push(
      "| **GPU** | Availability | **Unavailable / CPU Fallback** (no nvidia-smi detected) |"
    );
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // Stage Performance
  lines.push("## 3. Stage-Level Performance & Latency");
  lines.push("");
  lines.push(
    "| Stage | Status | Provider | Completed/Failed | P50 Latency | P95 Latency | Max Latency | Throughput | Real-Time Factor (xRT) |"
  );
  lines.push("| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |");

  const stageKeys: PipelineStage[] = ["reframe", "avs", "captions", "dubbing"];
  for (const sk of stageKeys) {
    const s = stages[sk];
    if (!s) {
      lines.push(`| \`${sk}\` | *skipped* | - | 0/0 | - | - | - | - | - |`);
      continue;
    }
    lines.push(
      `| \`${s.stage}\` | \`${s.status}\` | ${s.provider} | ${s.completedJobs}/${s.failedJobs} | ${s.latency.p50Ms} ms | ${s.latency.p95Ms} ms | ${s.latency.maxMs} ms | ${s.throughputJobsPerSec} jobs/s | ${s.realtimeFactorLabel} |`
    );
  }

  if (endToEnd) {
    lines.push(
      `| **End-to-End Pipeline** | \`${endToEnd.status}\` | multi-stage | ${endToEnd.completedJobs}/${endToEnd.failedJobs} | ${endToEnd.latency.p50Ms} ms | ${endToEnd.latency.p95Ms} ms | ${endToEnd.latency.maxMs} ms | ${endToEnd.throughputJobsPerSec} jobs/s | ${endToEnd.realtimeFactorLabel} |`
    );
  }

  lines.push("");
  lines.push("---");
  lines.push("");

  // Cost Accounting Breakdown
  lines.push("## 4. Cost Accounting Breakdown");
  lines.push("");
  lines.push(
    "| Stage | Execution Mode | Measured Compute (s) | Compute Cost ($) | External API Cost ($) | Total Cost ($) | Cost / Completed Job | Cost / Media Minute |"
  );
  lines.push("| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |");

  for (const sk of stageKeys) {
    const s = stages[sk];
    if (!s) {
      continue;
    }
    const c = s.cost;
    const cpjStr =
      c.costPerCompletedJobUsd !== null ? `$${c.costPerCompletedJobUsd.toFixed(6)}` : "N/A";
    const cpmStr = c.costPerMinuteUsd !== null ? `$${c.costPerMinuteUsd.toFixed(6)}` : "N/A";
    lines.push(
      `| \`${s.stage}\` | \`${s.status}\` | ${c.measuredComputeDurationSec} s | $${c.computeCostUsd.toFixed(6)} | $${c.externalApiCostUsd.toFixed(6)} | **$${c.totalCostUsd.toFixed(6)}** | ${cpjStr} | ${cpmStr} |`
    );
  }

  if (endToEnd) {
    const c = endToEnd.cost;
    const cpjStr =
      c.costPerCompletedJobUsd !== null ? `$${c.costPerCompletedJobUsd.toFixed(6)}` : "N/A";
    const cpmStr = c.costPerMinuteUsd !== null ? `$${c.costPerMinuteUsd.toFixed(6)}` : "N/A";
    lines.push(
      `| **End-to-End** | \`${endToEnd.status}\` | ${c.measuredComputeDurationSec} s | $${c.computeCostUsd.toFixed(6)} | $${c.externalApiCostUsd.toFixed(6)} | **$${c.totalCostUsd.toFixed(6)}** | **${cpjStr}** | **${cpmStr}** |`
    );
  }

  lines.push("");
  lines.push("### Pricing Assumptions Applied");
  lines.push("");
  lines.push(
    `- **Compute Instance:** ${pricing.instanceType} @ **$${pricing.computeHourlyRateUsd}/hr**  `
  );
  lines.push(
    `  *Source:* ${pricing.computeSource} (Is assumption: \`${pricing.computeIsAssumption}\`)  `
  );
  lines.push(`- **Transcription Rate:** **$${pricing.transcriptionPerMinuteUsd}/min**  `);
  lines.push(
    `  *Source:* ${pricing.transcriptionSource} (Is assumption: \`${pricing.transcriptionIsAssumption}\`)  `
  );
  lines.push(`- **Dubbing Rate:** **$${pricing.dubbingPerMinuteUsd}/min**  `);
  lines.push(
    `  *Source:* ${pricing.dubbingSource} (Is assumption: \`${pricing.dubbingIsAssumption}\`)  `
  );
  lines.push("");

  if (summary.caveatsAndNotes.length > 0) {
    lines.push("### Benchmark Notes & Diagnostic Flags");
    lines.push("");
    for (const note of summary.caveatsAndNotes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function writeReports(
  report: BenchmarkRunReport,
  jsonPath?: string,
  markdownPath?: string
): { jsonWrittenTo?: string; markdownWrittenTo?: string } {
  const result: { jsonWrittenTo?: string; markdownWrittenTo?: string } = {};

  if (jsonPath) {
    const absPath = path.resolve(jsonPath);
    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(absPath, generateJsonReport(report), "utf8");
    result.jsonWrittenTo = absPath;
  }

  if (markdownPath) {
    const absPath = path.resolve(markdownPath);
    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(absPath, generateMarkdownReport(report), "utf8");
    result.markdownWrittenTo = absPath;
  }

  return result;
}
