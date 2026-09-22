// Shared types for AVS (AI Script, Voiceover & Audio Synchronization).
//
// All AVS state is persisted inside the existing Demo.editing JSON under an
// `avs` key (Demo.editing.avs) — there is no dedicated table or migration.
// Downstream stages degrade gracefully when parts are absent (no steps → treat
// the whole video as one step; no script → use the raw transcript; no voiceover
// → skip that stage), so most fields on AvsState are optional.

/** A slice of the demo video, derived from click-capture timestamps and editable in the timeline. */
export interface Step {
  id: string;
  index: number;
  startTime: number;
  endTime: number;
  label?: string;
}

/** Narration text for a single step. */
export interface ScriptLine {
  stepId: string;
  text: string;
}

/** The full per-step narration script, optionally rewritten into a tone. */
export interface ScriptDoc {
  tone?: "sales" | "onboarding" | "support" | "marketing";
  lines: ScriptLine[];
  raw?: string;
}

/** Where a step's audio begins and ends within the continuous voiceover track. */
export interface StepTiming {
  stepId: string;
  start: number;
  end: number;
}

/** A generated voiceover: one continuous MP3 plus per-step timing markers. */
export interface VoiceoverTrack {
  audioUrl: string;
  duration: number;
  voiceId: string;
  stepTimings: StepTiming[];
}

/** A phonetic override applied before TTS so a term is pronounced correctly. */
export interface PronunciationRule {
  term: string;
  phonetic: string;
}

/**
 * A stabilized caption cue transcribed from the voiceover: `text` shown from
 * `start` to `end` (seconds). Structurally identical to the `Cue` produced by
 * `app/lib/avs/karaoke.ts`, so the two are interchangeable without coupling.
 */
export interface CaptionCue {
  start: number;
  end: number;
  text: string;
}

/**
 * The intermediate source produced by the time-alignment pre-pass (AVS-2.4): the
 * original video re-timed with freeze-frames / silence and the continuous
 * voiceover muxed in. This URL becomes the source the normal export processes,
 * so the final render carries the AI voice and freeze-frame timing.
 */
export interface AlignedSource {
  videoUrl: string;
  duration: number;
}

// --- Dubbed-audio pacing (Task-00052) ----------------------------------------

/**
 * Where a step's dubbed audio sits inside the continuous dub track.
 * Structurally identical to StepTiming so both can be handled by the same
 * normalization helpers, but semantically distinct: these timings describe an
 * externally recorded human dub rather than internally generated TTS.
 */
export interface DubTiming {
  stepId: string;
  start: number;
  end: number;
}

/**
 * A pre-recorded dubbed audio track with per-step boundary markers.
 * The track is a single continuous file; dubTimings tells the worker which
 * slice of that file corresponds to each step so it can time-stretch/align
 * each segment independently.
 */
export interface DubTrack {
  /** GCS/HTTPS URL of the continuous dubbed audio file (MP3/WAV/AAC). */
  dubUrl: string;
  /** Total duration of the dubbed track in seconds. */
  duration: number;
  /** Language/locale code of the dubbed audio (e.g. "hi-IN", "fr-FR"). */
  language?: string;
  /** Per-step slice markers into the dub track. */
  dubTimings: DubTiming[];
}

/**
 * Output of the dub pacing pre-pass: a single aligned MP4 with the dubbed
 * audio muxed in and each step time-stretched to match the dub's pacing.
 */
export interface DubAlignedSource {
  videoUrl: string;
  duration: number;
}

/** The complete AVS state stored under Demo.editing.avs. */
export interface AvsState {
  steps: Step[];
  script?: ScriptDoc;
  voiceover?: VoiceoverTrack;
  pronunciation?: PronunciationRule[];
  /** Flicker-free captions generated from the voiceover audio (AVS-2.3). */
  captions?: CaptionCue[];
  /** Freeze-frame/silence aligned source with the voiceover muxed in (AVS-2.4). */
  aligned?: AlignedSource;
  /** Pre-recorded dubbed audio track with per-step timing markers (Task-00052). */
  dub?: DubTrack;
  /** Time-stretch aligned source with the dubbed audio muxed in (Task-00052). */
  dubAligned?: DubAlignedSource;
}
