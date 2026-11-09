/**
 * VoiceStudio Client & Adapter Type Definitions
 * Task-00103: VoiceStudio Integration
 */

export interface VoiceStudioConfig {
  /** VoiceStudio base URL. Defaults to http://127.0.0.1:3900 */
  baseUrl?: string;
  /** High-entropy API key for Authorization header */
  apiKey?: string;
  /** Primary TTS model (e.g. 'omnivoice', 'kokoro-82m', 'f5-tts'). Default: 'omnivoice' */
  defaultModel?: string;
  /** Request timeout in milliseconds. Defaults to 30000 (30s) */
  timeoutMs?: number;
  /** Maximum retry attempts for transient errors (503, 429). Defaults to 2 */
  maxRetries?: number;
  /** Explicit opt-in for paid ElevenLabs fallback when VoiceStudio is unavailable. Default: false */
  fallbackToPaid?: boolean;
}

export interface VoiceStudioHealthResponse {
  /** Service status: 'ok' when fully loaded, 'starting' during model load, 'error' on probe failure */
  status: "ok" | "starting" | "error";
  /** Reported hardware device string, e.g. 'cuda (NVIDIA Tesla T4)' or 'cpu' */
  device: string;
  /** Application version */
  version: string;
  /** Whether service is ready for immediate inference */
  isReady: boolean;
  /** True if running on CUDA / GPU hardware */
  isGpu?: boolean;
  /** Detected GPU model name, e.g. 'NVIDIA Tesla T4' */
  gpuModel?: string | null;
  /** Startup step if in 'starting' state */
  startupStep?: string;
  /** Startup human-readable label if in 'starting' state */
  startupLabel?: string;
  /** Suggested retry interval in seconds when starting (503) */
  retryAfterSec?: number;
  /** Model currently active in memory if loaded */
  currentModel?: string;
}

export interface VoiceStudioSpeechOptions {
  /** Input text to synthesize */
  text: string;
  /** Target model to use for this synthesis request */
  model?: string;
  /** Language ISO-639-1 / BCP-47 code (e.g. 'en', 'es', 'fr', 'zh') */
  language?: string;
  /** Voice identifier: preset name ('alloy', 'echo', etc.), profile ID, or reference clip */
  voice?: string;
  /** Output audio container format. Default: 'wav' */
  responseFormat?: "wav" | "mp3" | "opus" | "aac" | "flac";
  /** Playback speed factor (e.g. 1.0 = normal, 0.8 = slower, 1.25 = faster) */
  speed?: number;
  /** Target audio duration in seconds. Controls speech pacing */
  targetDurationSec?: number;
  /** Number of flow-matching / diffusion steps (default 16 on T4) */
  numStep?: number;
  /** Classifier-free guidance scale */
  guidanceScale?: number;
  /** Deterministic RNG seed */
  seed?: number;
}

export interface VoiceStudioSpeechResult {
  /** Raw decoded audio byte buffer */
  audio: Buffer;
  /** MIME content type returned by server (e.g. 'audio/wav', 'audio/mpeg') */
  contentType: string;
  /** Resolved audio extension */
  format: "wav" | "mp3" | "opus" | "aac" | "flac";
  /** Audio file size in bytes */
  fileSizeBytes: number;
  /** Measured duration in seconds if probed */
  durationSec?: number;
  /** Sample rate in Hz if probed */
  sampleRate?: number;
  /** Number of audio channels */
  channels?: number;
  /** Latency breakdown */
  timing: {
    /** Total request wall-clock time in ms */
    wallClockMs: number;
    /** Server-reported model inference time in ms if returned in header */
    serverInferenceMs?: number;
  };
}

export interface AudioProbeResult {
  isValid: boolean;
  format?: string;
  durationSec?: number;
  sampleRate?: number;
  channels?: number;
  bitRate?: number;
  error?: string;
}

export type VoiceStudioErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "TIMEOUT"
  | "AUDIO_VALIDATION_FAILED"
  | "INVALID_INPUT"
  | "INFERENCE_FAILED"
  | "CONNECTION_REFUSED";

export interface VoiceStudioErrorDetails {
  code: VoiceStudioErrorCode;
  statusCode?: number;
  message: string;
  retryAfterSec?: number;
  rawResponse?: string;
}

export type VoiceStudioSpeechRequest = VoiceStudioSpeechOptions;
