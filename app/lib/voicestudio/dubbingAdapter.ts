/**
 * VoiceStudio Dubbing Pipeline Adapter (Task-00103)
 * Bridges VoiceStudio speech generation with Marvedge's AVS timed alignment workflow.
 * Manages provider resolution, strict fallback semantics, and step-timed synthesis.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { VoiceStudioClient, createVoiceStudioClient } from "./client";
import { VoiceStudioError, VoiceStudioUnavailableError } from "./errors";
import type { VoiceStudioConfig, VoiceStudioSpeechRequest } from "./types";

export interface TimedStepNarration {
  stepId: string;
  text: string;
  startTime?: number;
  endTime?: number;
  targetDurationSec?: number;
}

export interface TimedVoiceoverResult {
  audioBuffer: Buffer;
  format: string;
  durationSec: number;
  stepTimings: Array<{
    stepId: string;
    start: number;
    end: number;
    durationSec: number;
  }>;
}

export interface DubbingProviderResolution {
  provider: "elevenlabs" | "voicestudio";
  isFallback: boolean;
  notes: string[];
}

/**
 * Resolves the active dubbing provider strictly based on configuration.
 * Never silently switches without explicit opt-in.
 */
export function resolveDubbingProvider(options?: {
  configuredProvider?: string;
  fallbackToPaid?: boolean;
}): "elevenlabs" | "voicestudio" {
  const envChoice = (
    options?.configuredProvider ||
    process.env.DUBBING_PROVIDER ||
    "elevenlabs"
  )
    .trim()
    .toLowerCase();

  if (envChoice === "voicestudio") {
    return "voicestudio";
  }

  // Preserve production default
  return "elevenlabs";
}

export class VoiceStudioDubbingAdapter {
  private readonly client: VoiceStudioClient;

  constructor(clientOrConfig?: VoiceStudioClient | VoiceStudioConfig) {
    if (clientOrConfig instanceof VoiceStudioClient) {
      this.client = clientOrConfig;
    } else {
      this.client = createVoiceStudioClient(clientOrConfig);
    }
  }

  public getClient(): VoiceStudioClient {
    return this.client;
  }

  /**
   * Synthesizes audio for an array of timed script steps.
   * Maps target durations to step time budgets, calculates accumulated timestamps,
   * and prepares output structure conforming to Marvedge /avs-dub and /avs-sync contracts.
   */
  public async synthesizeTimedSteps(
    steps: TimedStepNarration[],
    options?: {
      language?: string;
      voice?: string;
      speed?: number;
      fallbackToPaid?: boolean;
    }
  ): Promise<TimedVoiceoverResult> {
    const cleanSteps = steps
      .map((s) => ({
        stepId: s.stepId.trim(),
        text: s.text.trim(),
        targetDurationSec:
          s.targetDurationSec !== undefined && s.targetDurationSec > 0
            ? s.targetDurationSec
            : s.endTime !== undefined && s.startTime !== undefined && s.endTime > s.startTime
              ? Number((s.endTime - s.startTime).toFixed(3))
              : undefined,
      }))
      .filter((s) => s.stepId && s.text);

    if (cleanSteps.length === 0) {
      throw new VoiceStudioError("INVALID_INPUT", "No valid steps provided for timed dubbing synthesis");
    }

    const stepTimings: Array<{
      stepId: string;
      start: number;
      end: number;
      durationSec: number;
    }> = [];

    const audioBuffers: Buffer[] = [];
    let currentTimelineSec = 0;

    for (const step of cleanSteps) {
      const speechReq: VoiceStudioSpeechRequest = {
        text: step.text,
        language: options?.language,
        voice: options?.voice,
        speed: options?.speed ?? 1.0,
        responseFormat: "wav",
        targetDurationSec: step.targetDurationSec,
      };

      const result = await this.client.generateSpeech(speechReq);
      const measuredDuration = result.durationSec || step.targetDurationSec || 1.0;

      const stepStart = Number(currentTimelineSec.toFixed(3));
      const stepEnd = Number((currentTimelineSec + measuredDuration).toFixed(3));

      stepTimings.push({
        stepId: step.stepId,
        start: stepStart,
        end: stepEnd,
        durationSec: measuredDuration,
      });

      audioBuffers.push(result.audio);
      currentTimelineSec += measuredDuration;
    }

    // Concatenate individual WAV segments (stripping headers after first chunk)
    const combinedBuffer = concatenateWavBuffers(audioBuffers);
    const totalDurationSec = Number(currentTimelineSec.toFixed(3));

    return {
      audioBuffer: combinedBuffer,
      format: "wav",
      durationSec: totalDurationSec,
      stepTimings,
    };
  }
}

/**
 * Basic in-memory concatenation of PCM WAV buffers sharing sample rate and channel layout.
 * Updates the 44-byte RIFF/WAVE header sizes to reflect total concatenated data.
 */
export function concatenateWavBuffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) {
    return Buffer.alloc(0);
  }
  if (buffers.length === 1) {
    return buffers[0];
  }

  // Extract raw PCM audio data after 44-byte standard header
  const dataChunks: Buffer[] = [];
  let totalDataLength = 0;

  for (let i = 0; i < buffers.length; i++) {
    const b = buffers[i];
    if (b.length > 44 && b.toString("ascii", 0, 4) === "RIFF") {
      const pcmData = b.slice(44);
      dataChunks.push(pcmData);
      totalDataLength += pcmData.length;
    } else {
      dataChunks.push(b);
      totalDataLength += b.length;
    }
  }

  // Use header from the first buffer as template
  const headerTemplate = buffers[0].slice(0, 44);
  const result = Buffer.alloc(44 + totalDataLength);

  headerTemplate.copy(result, 0, 0, 44);

  // Update RIFF chunk size at offset 4: (file size - 8)
  result.writeUInt32LE(36 + totalDataLength, 4);

  // Update data chunk size at offset 40: data size
  result.writeUInt32LE(totalDataLength, 40);

  let offset = 44;
  for (const chunk of dataChunks) {
    chunk.copy(result, offset);
    offset += chunk.length;
  }

  return result;
}
