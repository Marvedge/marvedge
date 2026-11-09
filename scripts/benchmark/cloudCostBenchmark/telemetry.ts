/**
 * Task-0102: Telemetry and Resource Measurement Layer
 * Captures wall-clock latency, CPU/memory utilization, and GPU metrics via non-blocking polling.
 */

import { execFile, spawnSync } from "child_process";
import os from "os";
import type {
  CpuTelemetry,
  GpuTelemetry,
  HardwareTelemetry,
  LatencyMetrics,
  MemoryTelemetry,
} from "./types";

export function calculatePercentiles(samples: number[]): LatencyMetrics {
  if (!samples || samples.length === 0) {
    return {
      count: 0,
      p50Ms: 0,
      p95Ms: 0,
      minMs: 0,
      maxMs: 0,
      meanMs: 0,
      stdDevMs: 0,
      rawLatenciesMs: [],
    };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const count = sorted.length;
  const minMs = sorted[0];
  const maxMs = sorted[count - 1];

  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const meanMs = sum / count;

  const variance =
    count > 1 ? sorted.reduce((acc, v) => acc + Math.pow(v - meanMs, 2), 0) / count : 0;
  const stdDevMs = Math.sqrt(variance);

  const getPercentile = (p: number): number => {
    if (count === 1) {
      return sorted[0];
    }
    const index = (p / 100) * (count - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (upper >= count) {
      return sorted[count - 1];
    }
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  };

  const p50Ms = getPercentile(50);
  const p95Ms = getPercentile(95);

  return {
    count,
    p50Ms: Number(p50Ms.toFixed(2)),
    p95Ms: Number(p95Ms.toFixed(2)),
    minMs: Number(minMs.toFixed(2)),
    maxMs: Number(maxMs.toFixed(2)),
    meanMs: Number(meanMs.toFixed(2)),
    stdDevMs: Number(stdDevMs.toFixed(2)),
    rawLatenciesMs: sorted.map((v) => Number(v.toFixed(2))),
  };
}

export interface GpuRawSample {
  memUsedMib: number;
  memTotalMib: number;
  gpuUtilPct: number;
  tempC: number;
}

export class TelemetryCollector {
  private active = false;
  private intervalTimer: NodeJS.Timeout | null = null;
  private gpuAvailable: boolean | null = null;
  private gpuModelName: string | null = null;
  private gpuDriverVersion: string | null = null;
  private gpuCudaVersion: string | null = null;
  private gpuSamplingError: string | null = null;

  private gpuSamples: GpuRawSample[] = [];
  private cpuUtilizationSamples: number[] = [];
  private rssMemorySamples: number[] = [];

  private lastCpuUsage: NodeJS.CpuUsage | null = null;
  private lastCpuCheckHrTime: [number, number] | null = null;
  private isGpuPollingInProgress = false;

  private readonly pollIntervalMs: number;
  private readonly checkGpu: boolean;

  constructor(options?: { pollIntervalMs?: number; checkGpu?: boolean }) {
    this.pollIntervalMs = options?.pollIntervalMs ?? 100;
    this.checkGpu = options?.checkGpu ?? true;
  }

  public isGpuDetected(): boolean {
    if (this.gpuAvailable !== null) {
      return this.gpuAvailable;
    }
    if (!this.checkGpu) {
      this.gpuAvailable = false;
      return false;
    }

    try {
      const probe = spawnSync(
        "nvidia-smi",
        ["--query-gpu=name,driver_version", "--format=csv,noheader,nounits"],
        { timeout: 1500, encoding: "utf8" }
      );

      if (probe.status === 0 && probe.stdout && probe.stdout.trim().length > 0) {
        const lines = probe.stdout.trim().split("\n");
        const parts = lines[0].split(",").map((s) => s.trim());
        this.gpuModelName = parts[0] || null;
        this.gpuDriverVersion = parts[1] || null;
        this.gpuAvailable = true;
      } else {
        this.gpuAvailable = false;
      }
    } catch {
      this.gpuAvailable = false;
    }

    return this.gpuAvailable;
  }

  public start(): void {
    if (this.active) {
      return;
    }
    this.active = true;
    this.gpuSamples = [];
    this.cpuUtilizationSamples = [];
    this.rssMemorySamples = [];
    this.gpuSamplingError = null;

    const hasGpu = this.isGpuDetected();

    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuCheckHrTime = process.hrtime();

    this.intervalTimer = setInterval(() => {
      this.sampleResources(hasGpu);
    }, this.pollIntervalMs);
  }

  public stop(): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    // Take one final synchronous CPU/memory sample
    this.sampleCpuAndMemory();
  }

  private sampleResources(pollGpu: boolean): void {
    this.sampleCpuAndMemory();

    // Non-blocking GPU sampling via execFile to avoid blocking the Node.js event loop
    if (pollGpu && !this.isGpuPollingInProgress && this.active) {
      this.isGpuPollingInProgress = true;
      execFile(
        "nvidia-smi",
        [
          "--query-gpu=memory.used,memory.total,utilization.gpu,temperature.gpu",
          "--format=csv,noheader,nounits",
        ],
        { timeout: 800, encoding: "utf8" },
        (err, stdout) => {
          this.isGpuPollingInProgress = false;
          if (!this.active) {
            return;
          }

          if (err) {
            this.gpuSamplingError = err.message;
            return;
          }

          if (stdout) {
            const parts = stdout
              .trim()
              .split(",")
              .map((s) => s.trim());
            if (parts.length >= 4) {
              this.gpuSamples.push({
                memUsedMib: parseFloat(parts[0]) || 0,
                memTotalMib: parseFloat(parts[1]) || 0,
                gpuUtilPct: parseFloat(parts[2]) || 0,
                tempC: parseFloat(parts[3]) || 0,
              });
            }
          }
        }
      );
    }
  }

  private sampleCpuAndMemory(): void {
    try {
      // 1. Process RSS memory
      const mem = process.memoryUsage();
      this.rssMemorySamples.push(mem.rss);

      // 2. CPU utilization over elapsed delta
      if (this.lastCpuUsage && this.lastCpuCheckHrTime) {
        const currentCpu = process.cpuUsage(this.lastCpuUsage);
        const currentHr = process.hrtime(this.lastCpuCheckHrTime);
        const elapsedMicros = currentHr[0] * 1_000_000 + currentHr[1] / 1_000;

        if (elapsedMicros > 0) {
          const totalCpuMicros = currentCpu.user + currentCpu.system;
          const numCpus = os.cpus().length || 1;
          const utilPct = (totalCpuMicros / (elapsedMicros * numCpus)) * 100;
          this.cpuUtilizationSamples.push(Math.min(100, Math.max(0, utilPct)));
        }

        this.lastCpuUsage = process.cpuUsage();
        this.lastCpuCheckHrTime = process.hrtime();
      }
    } catch {
      // Metric sampling errors should never disrupt execution
    }
  }

  public getHardwareTelemetry(): HardwareTelemetry {
    const numCpus = os.cpus().length;
    const cpuModel = numCpus > 0 ? os.cpus()[0].model : "Unknown CPU";

    const avgCpu =
      this.cpuUtilizationSamples.length > 0
        ? this.cpuUtilizationSamples.reduce((a, b) => a + b, 0) / this.cpuUtilizationSamples.length
        : null;
    const peakCpu =
      this.cpuUtilizationSamples.length > 0 ? Math.max(...this.cpuUtilizationSamples) : null;

    const cpuTele: CpuTelemetry = {
      model: cpuModel,
      cores: numCpus,
      avgUtilizationPct: avgCpu !== null ? Number(avgCpu.toFixed(1)) : null,
      peakUtilizationPct: peakCpu !== null ? Number(peakCpu.toFixed(1)) : null,
    };

    const avgRss =
      this.rssMemorySamples.length > 0
        ? this.rssMemorySamples.reduce((a, b) => a + b, 0) / this.rssMemorySamples.length
        : process.memoryUsage().rss;
    const peakRss =
      this.rssMemorySamples.length > 0
        ? Math.max(...this.rssMemorySamples)
        : process.memoryUsage().rss;

    const memTele: MemoryTelemetry = {
      totalBytes: os.totalmem(),
      freeBytes: os.freemem(),
      processAvgRssBytes: Math.round(avgRss),
      processPeakRssBytes: Math.round(peakRss),
    };

    let gpuTele: GpuTelemetry | null = null;
    if (this.gpuAvailable) {
      const peakVram =
        this.gpuSamples.length > 0 ? Math.max(...this.gpuSamples.map((s) => s.memUsedMib)) : null;
      const totalVram = this.gpuSamples.length > 0 ? this.gpuSamples[0].memTotalMib : null;
      const avgVram =
        this.gpuSamples.length > 0
          ? this.gpuSamples.reduce((a, s) => a + s.memUsedMib, 0) / this.gpuSamples.length
          : null;
      const avgGpu =
        this.gpuSamples.length > 0
          ? this.gpuSamples.reduce((a, s) => a + s.gpuUtilPct, 0) / this.gpuSamples.length
          : null;
      const peakGpu =
        this.gpuSamples.length > 0 ? Math.max(...this.gpuSamples.map((s) => s.gpuUtilPct)) : null;
      const maxTemp =
        this.gpuSamples.length > 0 ? Math.max(...this.gpuSamples.map((s) => s.tempC)) : null;

      gpuTele = {
        isAvailable: true,
        modelName: this.gpuModelName,
        driverVersion: this.gpuDriverVersion,
        cudaVersion: this.gpuCudaVersion,
        totalVramMib: totalVram,
        peakVramUsedMib: peakVram !== null ? Math.round(peakVram) : null,
        avgVramUsedMib: avgVram !== null ? Math.round(avgVram) : null,
        avgGpuUtilPct: avgGpu !== null ? Number(avgGpu.toFixed(1)) : null,
        peakGpuUtilPct: peakGpu !== null ? Number(peakGpu.toFixed(1)) : null,
        maxTempC: maxTemp,
        samplingError: this.gpuSamplingError,
      };
    } else {
      gpuTele = {
        isAvailable: false,
        modelName: null,
        driverVersion: null,
        cudaVersion: null,
        totalVramMib: null,
        peakVramUsedMib: null,
        avgVramUsedMib: null,
        avgGpuUtilPct: null,
        peakGpuUtilPct: null,
        maxTempC: null,
        samplingError: null,
      };
    }

    return {
      os: {
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
      },
      runtime: {
        nodeVersion: process.version,
        v8Version: process.versions.v8,
      },
      cpu: cpuTele,
      memory: memTele,
      gpu: gpuTele,
    };
  }
}
