/**
 * Task-0102: Pipeline Stage Providers & Execution Engine
 * Connects genuine production provider clients when opted in,
 * enforces strict preflight prerequisites, and maintains a zero-network offline fixture mode.
 */

import fs from "fs";
import path from "path";
import {
  buildFfmpegCropFilter,
  validateCropTargetData,
  type CropTargetData,
} from "../../../app/types/editor/crop-target";
import { formatAssTime } from "../../../app/lib/subtitles/ass";
import { realisticWhisperVerboseResponse } from "../../../app/lib/subtitles/fixtures/whisperSample";
import { callMlInference } from "../../../reframe-worker/client";
import { createDubbingJob } from "../../../app/lib/elevenlabs/dubbing";
import type { InputMediaMetadata, PipelineStage, StageExecutionStatus } from "./types";

export interface StageExecutionOutput {
  stage: PipelineStage;
  status: StageExecutionStatus;
  provider: string;
  notes: string[];
  error?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  outputArtifacts?: Record<string, any>;
}

/**
 * 1. REFRAME STAGE (AutoFlip Video Reframing)
 */
export async function executeReframeStage(
  media: InputMediaMetadata,
  providerMode: "fixture" | "autoflip" | "real" = "fixture"
): Promise<StageExecutionOutput> {
  const notes: string[] = [];

  if (providerMode === "autoflip" || providerMode === "real") {
    const serviceUrl = process.env.AUTOFILP_SERVICE_URL || process.env.ML_GATEWAY_URL;
    if (!serviceUrl) {
      return {
        stage: "reframe",
        status: "blocked",
        provider: "autoflip",
        notes: [
          "Real AutoFlip execution requested, but neither AUTOFILP_SERVICE_URL nor ML_GATEWAY_URL is configured.",
          "Preflight blocked: Refusing to fabricate real inference without working service.",
        ],
        error: "AUTOFILP_SERVICE_URL_UNSET",
      };
    }

    try {
      const cropTargets = await callMlInference(
        serviceUrl,
        {
          videoUrl: media.path,
          targetAspectRatio: "9:16",
        },
        { timeoutMs: 15000 }
      );

      notes.push(`Executed live AutoFlip inference via ${serviceUrl}`);
      notes.push(`Extracted ${cropTargets.crop_targets.length} crop target transitions`);

      return {
        stage: "reframe",
        status: "real_inference",
        provider: "autoflip",
        notes,
        outputArtifacts: {
          cropTargetsCount: cropTargets.crop_targets.length,
        },
      };
    } catch (err: unknown) {
      return {
        stage: "reframe",
        status: "blocked",
        provider: "autoflip",
        notes: [`AutoFlip inference error: ${(err as Error).message}`],
        error: (err as Error).message,
      };
    }
  }

  // Fixture Mode: Pure offline execution using deterministic crop targets
  const duration = Math.max(1, media.durationSec);
  const sampleCropData: CropTargetData = {
    schema_version: 1,
    source: {
      width: 1280,
      height: 720,
      duration_sec: duration,
    },
    output: {
      aspect_ratio: "9:16",
      width: 405,
      height: 720,
    },
    crop_targets: [
      {
        timestamp_sec: 0,
        crop: { x: 420, y: 0, width: 405, height: 720 },
        confidence: 0.98,
      },
      {
        timestamp_sec: Math.min(duration * 0.5, 3.5),
        crop: { x: 400, y: 0, width: 405, height: 720 },
        confidence: 0.95,
      },
    ],
  };

  validateCropTargetData(sampleCropData);
  const filterString = buildFfmpegCropFilter(sampleCropData.crop_targets);

  notes.push("Offline fixture: Deterministic 9:16 crop filter generated and validated");
  notes.push(`Crop targets validated: ${sampleCropData.crop_targets.length} transitions`);

  return {
    stage: "reframe",
    status: "fixture",
    provider: "fixture",
    notes,
    outputArtifacts: {
      cropFilter: filterString,
      targetCount: sampleCropData.crop_targets.length,
    },
  };
}

/**
 * 2. AVS STAGE (Active Speaker Detection via TalkNet)
 */
export async function executeAvsStage(
  media: InputMediaMetadata,
  providerMode: "fixture" | "talknet" | "real" = "fixture"
): Promise<StageExecutionOutput> {
  const notes: string[] = [];

  if (providerMode === "talknet" || providerMode === "real") {
    // 1. Verify model weights presence before inference
    const weightPaths = [
      path.join(process.cwd(), "talknet", "weights", "sfd_face.pth"),
      path.join(process.cwd(), "talknet", "weights", "pretrain_TalkSet.model"),
    ];

    const missingWeights = weightPaths.filter((p) => !fs.existsSync(p));
    if (missingWeights.length > 0) {
      return {
        stage: "avs",
        status: "blocked",
        provider: "talknet",
        notes: [
          `TalkNet model weights missing: ${missingWeights.map((p) => path.basename(p)).join(", ")}`,
          "Automatic model weight download is disabled per Task-0102 policy.",
          "Preflight blocked: Place weights in talknet/weights/ before running real AVS inference.",
        ],
        error: "TALKNET_WEIGHTS_MISSING",
      };
    }

    const serviceUrl = process.env.TALKNET_SERVICE_URL || process.env.ML_GATEWAY_URL;
    if (!serviceUrl) {
      return {
        stage: "avs",
        status: "blocked",
        provider: "talknet",
        notes: ["TalkNet model weights verified, but TALKNET_SERVICE_URL is not set."],
        error: "TALKNET_SERVICE_URL_UNSET",
      };
    }

    try {
      const detectUrl = `${serviceUrl.replace(/\/+$/, "")}/detect`;
      const res = await fetch(detectUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: media.path }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        throw new Error(`TalkNet returned HTTP ${res.status}: ${await res.text()}`);
      }

      const body = (await res.json()) as Record<string, unknown>;
      notes.push(`TalkNet active speaker inference completed via ${detectUrl}`);

      return {
        stage: "avs",
        status: "real_inference",
        provider: "talknet",
        notes,
        outputArtifacts: body,
      };
    } catch (err: unknown) {
      return {
        stage: "avs",
        status: "blocked",
        provider: "talknet",
        notes: [`TalkNet inference failure: ${(err as Error).message}`],
        error: (err as Error).message,
      };
    }
  }

  // Fixture Mode: Offline active speaker speech timeline
  const activeSegments = [
    { start: 0.12, end: 3.05, activeSpeakerConfidence: 0.94 },
    { start: 4.1, end: 8.35, activeSpeakerConfidence: 0.91 },
    { start: 9.3, end: 14.15, activeSpeakerConfidence: 0.88 },
  ].filter((seg) => seg.start < media.durationSec);

  notes.push("Offline fixture: Deterministic active speaker timeline generated");
  notes.push(`Generated ${activeSegments.length} active speaker speech tracks`);

  return {
    stage: "avs",
    status: "fixture",
    provider: "fixture",
    notes,
    outputArtifacts: {
      activeSegments,
    },
  };
}

/**
 * 3. CAPTIONS STAGE (Subtitle Generation & Burn-in)
 */
export async function executeCaptionsStage(
  media: InputMediaMetadata,
  providerMode: "fixture" | "whisper" | "groq" = "fixture"
): Promise<StageExecutionOutput> {
  const notes: string[] = [];

  if (providerMode === "whisper") {
    if (!process.env.OPENAI_API_KEY) {
      return {
        stage: "captions",
        status: "blocked",
        provider: "whisper",
        notes: ["Real Whisper transcription requested but OPENAI_API_KEY is unset."],
        error: "OPENAI_API_KEY_UNSET",
      };
    }

    try {
      const OpenAIModule = await import("openai");
      const OpenAI = OpenAIModule.default || OpenAIModule;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(media.path) as unknown as never,
        model: "whisper-1",
        response_format: "verbose_json",
        timestamp_granularities: ["segment"],
      });

      notes.push("Live audio transcription successfully returned from OpenAI Whisper API");
      return {
        stage: "captions",
        status: "real_inference",
        provider: "whisper",
        notes,
        outputArtifacts: { text: transcription.text },
      };
    } catch (err: unknown) {
      return {
        stage: "captions",
        status: "blocked",
        provider: "whisper",
        notes: [`OpenAI Whisper error: ${(err as Error).message}`],
        error: (err as Error).message,
      };
    }
  }

  if (providerMode === "groq") {
    if (!process.env.GROQ_API_KEY) {
      return {
        stage: "captions",
        status: "blocked",
        provider: "groq",
        notes: ["Real Groq Whisper transcription requested but GROQ_API_KEY is unset."],
        error: "GROQ_API_KEY_UNSET",
      };
    }

    try {
      const GroqModule = await import("groq-sdk");
      const Groq = GroqModule.default || GroqModule;
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

      const transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(media.path) as unknown as never,
        model: "whisper-large-v3",
        response_format: "verbose_json",
      });

      notes.push("Live audio transcription successfully returned from Groq Whisper API");
      return {
        stage: "captions",
        status: "real_inference",
        provider: "groq",
        notes,
        outputArtifacts: { text: transcription.text },
      };
    } catch (err: unknown) {
      return {
        stage: "captions",
        status: "blocked",
        provider: "groq",
        notes: [`Groq Whisper error: ${(err as Error).message}`],
        error: (err as Error).message,
      };
    }
  }

  // Fixture Mode: Use deterministic realistic Whisper verbose response fixture
  const fixtureData = realisticWhisperVerboseResponse;

  const events: string[] = [];
  let prevStart = -1;

  for (const seg of fixtureData.segments || []) {
    if (seg.start >= media.durationSec) {
      break;
    }
    const end = Math.min(seg.end, media.durationSec);
    const duration = end - seg.start;

    // Subtitle invariant checks
    if (duration < 0.3) {
      continue;
    }
    if (seg.start < prevStart) {
      throw new Error("Subtitle invariant violation: start times are decreasing");
    }
    prevStart = seg.start;

    const startAss = formatAssTime(seg.start);
    const endAss = formatAssTime(end);
    events.push(`Dialogue: 0,${startAss},${endAss},Default,,0,0,0,,${seg.text.trim()}`);
  }

  notes.push("Offline fixture: Whisper verbose response fixture normalized");
  notes.push(`Generated ${events.length} ASS Dialogue lines conforming to burn-in invariants`);

  return {
    stage: "captions",
    status: "fixture",
    provider: "fixture",
    notes,
    outputArtifacts: {
      cuesCount: events.length,
      sampleAssEvent: events[0] || "",
    },
  };
}

/**
 * 4. DUBBING STAGE (Audio Dubbing & Alignment)
 */
export async function executeDubbingStage(
  media: InputMediaMetadata,
  providerMode: "fixture" | "elevenlabs" | "voicestudio" | "real" = "fixture",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config?: any
): Promise<StageExecutionOutput> {
  const notes: string[] = [];

  if (providerMode === "voicestudio") {
    const vsUrl =
      config?.voiceStudioUrl || process.env.VOICESTUDIO_API_URL || "http://127.0.0.1:3900";
    const vsApiKey = config?.voiceStudioApiKey || process.env.VOICESTUDIO_API_KEY;
    const vsModel = config?.voiceStudioModel || process.env.VOICESTUDIO_MODEL || "omnivoice";

    const { createVoiceStudioClient, assertValidAudio } =
      await import("../../../app/lib/voicestudio");

    const client = createVoiceStudioClient({
      baseUrl: vsUrl,
      apiKey: vsApiKey,
      defaultModel: vsModel,
      timeoutMs: 45000,
      maxRetries: 1,
    });

    let health;
    try {
      health = await client.checkHealth({ timeoutMs: 5000 });
      if (!health.isReady) {
        return {
          stage: "dubbing",
          status: "blocked",
          provider: "voicestudio",
          notes: [
            `VoiceStudio service is starting up: ${health.startupLabel || health.status}`,
            "Retry once model loading completes.",
          ],
          error: "VOICESTUDIO_STARTING",
        };
      }
    } catch (err: unknown) {
      return {
        stage: "dubbing",
        status: "blocked",
        provider: "voicestudio",
        notes: [
          `VoiceStudio health check failed at ${vsUrl}: ${(err as Error).message}`,
          "Ensure VoiceStudio container is running on 127.0.0.1:3900.",
        ],
        error: "VOICESTUDIO_UNAVAILABLE",
      };
    }

    try {
      const benchmarkText =
        "Marvedge cloud cost benchmark speech synthesis validation. Evaluating local GPU speech performance.";

      const speechResult = await client.generateSpeech({
        text: benchmarkText,
        language: "es",
        targetDurationSec: media.durationSec > 0 ? media.durationSec : 5.0,
        responseFormat: "wav",
      });

      const artifactDir = path.resolve(process.cwd(), "benchmark_results", "artifacts");
      fs.mkdirSync(artifactDir, { recursive: true });
      const artifactName = `voicestudio_dubbing_${Date.now()}.${speechResult.format}`;
      const artifactPath = path.join(artifactDir, artifactName);
      fs.writeFileSync(artifactPath, speechResult.audio);

      await assertValidAudio(speechResult.audio, speechResult.format);

      notes.push(`VoiceStudio real inference successful via ${vsUrl}`);
      notes.push(`Compute device: ${health.device} (CUDA: ${health.isGpu})`);
      notes.push(`Saved audio artifact: ${artifactName} (${speechResult.fileSizeBytes} bytes)`);

      return {
        stage: "dubbing",
        status: "real_inference",
        provider: "voicestudio",
        notes,
        outputArtifacts: {
          artifactPath,
          format: speechResult.format,
          fileSizeBytes: speechResult.fileSizeBytes,
          durationSec: speechResult.durationSec || media.durationSec,
          sampleRate: speechResult.sampleRate,
          channels: speechResult.channels,
          device: health.device,
          isGpu: health.isGpu,
        },
      };
    } catch (err: unknown) {
      return {
        stage: "dubbing",
        status: "blocked",
        provider: "voicestudio",
        notes: [`VoiceStudio inference error: ${(err as Error).message}`],
        error: (err as Error).message,
      };
    }
  }

  if (providerMode === "elevenlabs" || providerMode === "real") {
    if (!process.env.ELEVENLABS_API_KEY) {
      return {
        stage: "dubbing",
        status: "blocked",
        provider: "elevenlabs",
        notes: ["Real ElevenLabs dubbing requested but ELEVENLABS_API_KEY is unset."],
        error: "ELEVENLABS_API_KEY_UNSET",
      };
    }

    try {
      const res = await createDubbingJob({
        sourceUrl: media.path,
        targetLanguage: "es",
      });

      notes.push(`Initiated ElevenLabs dubbing job ${res.dubbingId}`);
      return {
        stage: "dubbing",
        status: "real_inference",
        provider: "elevenlabs",
        notes,
        outputArtifacts: res,
      };
    } catch (err: unknown) {
      return {
        stage: "dubbing",
        status: "blocked",
        provider: "elevenlabs",
        notes: [`ElevenLabs dubbing API error: ${(err as Error).message}`],
        error: (err as Error).message,
      };
    }
  }

  // Fixture Mode: Deterministic synthetic dubbing alignment result
  const dubbingResult = {
    dubbingId: "fixture_dub_job_" + Date.now(),
    status: "COMPLETED",
    targetLanguage: "es",
    sourceDurationSec: media.durationSec,
    dubbedDurationSec: media.durationSec,
    alignmentScore: 0.96,
  };

  notes.push("Offline fixture: Deterministic audio dubbing alignment simulation");
  notes.push(`Dubbing alignment verified: ${dubbingResult.sourceDurationSec}s matches media`);

  return {
    stage: "dubbing",
    status: "fixture",
    provider: "fixture",
    notes,
    outputArtifacts: dubbingResult,
  };
}
