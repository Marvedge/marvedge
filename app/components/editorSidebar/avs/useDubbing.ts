// Orchestration for the AVS dubbing feature: upload/prepare a dub track, run
// POST /api/avs/dub, poll the job, and persist every result into the store's
// `avs` slice (steps/script/voiceover already live there and the existing
// autosave serializes the whole object into Demo.editing.avs — no new
// persistence path is needed).
//
// Refresh handling: an in-flight job is recorded as `avs.dubJob { jobId,
// startedAt }`, so when the editor reloads mid-run this hook re-attaches to the
// backend job and keeps polling until it terminates, then writes `avs.dubAligned`.
//
// Race handling: one run at a time (ref-guarded), an unmount/new run stops the
// current poll loop, and only the freshest poll result is persisted.

import React from "react";
import { toast } from "react-hot-toast";
import { useShallow } from "zustand/react/shallow";

import type { AvsState, DubAlignedSource, DubTrack } from "@/app/types/avs";
import type { DubJobState } from "@/app/lib/dubbing/normalize";
import type { DubRequestBody } from "@/app/lib/dubbing/request";
import { buildDubRequest } from "@/app/lib/dubbing/request";
import { pollDubJob, startDubJob } from "@/app/lib/dubbing/poll";
import { useEditorStore } from "@/app/store/editor/editorStore";
import { useZoomStore } from "@/app/store/editor/zoomStore";
import { resolveClickTimes } from "@/app/lib/avs/clickSources";
import { deriveSteps } from "@/app/lib/avs/deriveSteps";

export interface Dubbing {
  dub: DubTrack | null;
  dubAligned: DubAlignedSource | null;
  /** Present only while a job is being polled. */
  jobState: DubJobState | null;
  /** The backend's own progress (0-100), never fabricated. */
  progress: number | null;
  running: boolean;
  error: string | null;
  previewDubSource: boolean;
  setPreviewDubSource: (value: boolean) => void;
  canRun: boolean;
  blockedReason: string | null;
  run: () => void;
  /** Replace/clear the uploaded dub track (e.g. after a fresh upload). */
  setDubTrack: (track: DubTrack | null) => void;
  /** Add or update one step's timing markers (stepId, start, end). */
  setDubTiming: (stepId: string, start: number, end: number) => void;
}

/** Merge a patch into the persisted `avs` slice, preserving everything else. */
function patchAvs(
  setAvs: (updater: React.SetStateAction<AvsState | null>) => void,
  patch: Partial<AvsState>
): void {
  setAvs((prev) => ({ ...(prev ?? { steps: [] }), ...patch }));
}

interface SessionStore {
  onActivity: (running: boolean, state: DubJobState | null, progress: number | null) => void;
  onError: (message: string) => void;
  mergeAvs: (patch: Partial<AvsState>) => void;
  setPreviewDubSource: (value: boolean) => void;
  shouldStop: () => boolean;
  sourceDuration: number;
}

/**
 * Drive one dubbing job to completion: poll → persist result → surface errors.
 * Module-scope so the hook stays small and this session is reusable across both
 * a fresh run and a refresh-resume.
 */
async function driveDubJob(jobId: string, session: SessionStore): Promise<void> {
  const outcome = await pollDubJob(jobId, {
    shouldStop: session.shouldStop,
    onState: (state, progress) => session.onActivity(true, state, progress),
  });

  // Owner tore us down (unmount/new run). Keep `dubJob` persisted so a later
  // mount re-attaches — but stop the in-memory activity.
  if (outcome.status === "stopped") {
    return;
  }
  session.onActivity(false, null, null);

  if (outcome.status === "completed") {
    session.mergeAvs({ dubJob: undefined });
    if (outcome.alignedVideoUrl) {
      session.mergeAvs({
        dubAligned: {
          videoUrl: outcome.alignedVideoUrl,
          duration: outcome.duration > 0 ? outcome.duration : session.sourceDuration,
        },
      });
      session.setPreviewDubSource(true);
      toast.success("Dubbed video ready");
    } else {
      // The poller is not surfacing AVS_DUB's aligned source yet (backend gap we
      // are intentionally NOT patching) — keep whatever state we had.
      const message = "The dub finished but its aligned source was not returned.";
      session.onError(message);
      toast.error(message);
    }
    return;
  }

  // Terminal failure / cancellation / timeout: drop the tracked job.
  session.mergeAvs({ dubJob: undefined });
  if (outcome.status === "failed") {
    session.onError(outcome.error);
    toast.error(outcome.error);
  } else if (outcome.status === "cancelled") {
    session.onError("The dub job was cancelled.");
  } else if (outcome.status === "timed_out") {
    const message = "Timed out waiting for the dub to finish.";
    session.onError(message);
    toast.error(message);
  }
}

interface LaunchScope {
  session: Omit<SessionStore, "shouldStop">;
  stopPollRef: React.RefObject<boolean>;
  runningRef: React.RefObject<boolean>;
  onStart: () => void;
  onStartError: (message: string) => void;
  mergeAvs: (patch: Partial<AvsState>) => void;
}

/** POST the job, record it for refresh-resume, then drive it to completion. */
async function launchDub(body: DubRequestBody, scope: LaunchScope): Promise<void> {
  scope.runningRef.current = true;
  scope.onStart();
  scope.stopPollRef.current = false;
  try {
    const jobId = await startDubJob(body);
    scope.mergeAvs({ dubJob: { jobId, startedAt: Date.now() } });
    await driveDubJob(jobId, { ...scope.session, shouldStop: () => scope.stopPollRef.current });
  } catch (e: unknown) {
    scope.runningRef.current = false;
    scope.onStartError(e instanceof Error ? e.message : "Failed to start dubbing");
  }
}

interface SessionSetters {
  setRunning: React.Dispatch<React.SetStateAction<boolean>>;
  setJobState: React.Dispatch<React.SetStateAction<DubJobState | null>>;
  setProgress: React.Dispatch<React.SetStateAction<number | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  mergeAvs: (patch: Partial<AvsState>) => void;
  setPreviewDubSource: (value: boolean) => void;
  duration: number;
}

function makeSession(s: SessionSetters): Omit<SessionStore, "shouldStop"> {
  return {
    onActivity: (isRunning, state, value) => {
      s.setRunning(isRunning);
      s.setJobState(state);
      s.setProgress(value);
    },
    onError: s.setError,
    mergeAvs: s.mergeAvs,
    setPreviewDubSource: s.setPreviewDubSource,
    sourceDuration: s.duration,
  };
}

interface BlockedInput {
  savedDemoId: string | null;
  canFetchSource: boolean;
  duration: number;
  dubUrl: string | null;
}

function computeBlockedReason(input: BlockedInput): string | null {
  if (!input.savedDemoId) {
    return "Save the demo first, then dub it.";
  }
  if (!input.canFetchSource) {
    return "The source video is still uploading — try again in a moment.";
  }
  if (!(input.duration > 0)) {
    return "Load a video before dubbing.";
  }
  if (!input.dubUrl) {
    return "Upload the dubbed audio track first.";
  }
  return null;
}

function updateDubTiming(
  prev: AvsState | null,
  stepId: string,
  start: number,
  end: number
): AvsState {
  const base: AvsState = prev ?? { steps: [] };
  const current = base.dub;
  const next = current
    ? {
        ...current,
        dubTimings: [
          ...current.dubTimings.filter((t) => t.stepId !== stepId),
          { stepId, start, end },
        ],
      }
    : current;
  return { ...base, dub: next };
}

export function useDubbing(): Dubbing {
  const avs = useEditorStore((s) => s.avs);
  const videoUrl = useEditorStore((s) => s.videoUrl);
  const duration = useEditorStore((s) => s.duration);
  const savedDemoId = useEditorStore((s) => s.savedDemoId);
  const setAvs = useEditorStore((s) => s.setAvs);
  const previewDubSource = useEditorStore((s) => s.previewDubSource);
  const setPreviewDubSource = useEditorStore((s) => s.setPreviewDubSource);
  const clickTimes = useZoomStore(
    useShallow((s) => resolveClickTimes(s.extensionEvents, s.zoomSegments))
  );

  const [jobState, setJobState] = React.useState<DubJobState | null>(null);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const stopPollRef = React.useRef(false);
  const runningRef = React.useRef(false);

  const dub = avs?.dub ?? null;
  const dubAligned = avs?.dubAligned ?? null;
  const dubJob = avs?.dubJob ?? null;
  const mergeAvs = React.useCallback(
    (patch: Partial<AvsState>) => patchAvs(setAvs, patch),
    [setAvs]
  );
  const session = React.useMemo(
    () =>
      makeSession({
        setRunning,
        setJobState,
        setProgress,
        setError,
        mergeAvs,
        setPreviewDubSource,
        duration,
      }),
    [mergeAvs, setPreviewDubSource, duration]
  );

  const canFetchSource =
    typeof videoUrl === "string" && videoUrl.length > 0 && !videoUrl.startsWith("blob:");
  const blockedReason = React.useMemo(
    () =>
      computeBlockedReason({ savedDemoId, canFetchSource, duration, dubUrl: dub?.dubUrl ?? null }),
    [savedDemoId, canFetchSource, duration, dub?.dubUrl]
  );
  const canRun = blockedReason === null;

  const setDubTrack = React.useCallback(
    (track: DubTrack | null) => patchAvs(setAvs, { dub: track ?? undefined }),
    [setAvs]
  );
  const setDubTiming = React.useCallback(
    (stepId: string, start: number, end: number) =>
      setAvs((prev) => updateDubTiming(prev, stepId, start, end)),
    [setAvs]
  );

  const run = React.useCallback(() => {
    if (runningRef.current) {
      return;
    }
    if (!canRun) {
      if (blockedReason) {
        toast.error(blockedReason);
      }
      return;
    }
    // Steps fall back to one full-length step exactly like the AVS pipeline.
    const steps = avs?.steps?.length ? avs.steps : deriveSteps(clickTimes, duration);
    const built = buildDubRequest({
      videoUrl,
      dubUrl: dub?.dubUrl ?? "",
      steps,
      dubTimings: dub?.dubTimings ?? [],
      duration,
      sourceDuration: duration,
      demoId: savedDemoId,
    });
    if (!built.ok) {
      setError(built.error);
      toast.error(built.error);
      return;
    }
    void launchDub(built.body, {
      session,
      stopPollRef,
      runningRef,
      mergeAvs,
      onStart: () => {
        setRunning(true);
        setError(null);
        setJobState("pending");
        setProgress(null);
      },
      onStartError: (message) => {
        setRunning(false);
        setError(message);
        toast.error(message);
      },
    });
  }, [
    canRun,
    blockedReason,
    avs?.steps,
    clickTimes,
    duration,
    dub,
    videoUrl,
    savedDemoId,
    mergeAvs,
    session,
  ]);

  // Re-attach to an in-flight job after a refresh. The persisted `dubJob` is the
  // only cross-mount signal we have; once terminal it is cleared by the session.
  React.useEffect(() => {
    if (!dubJob || runningRef.current) {
      return;
    }
    runningRef.current = true;
    setRunning(true);
    setJobState("pending");
    setProgress(null);
    stopPollRef.current = false;
    void driveDubJob(dubJob.jobId, { ...session, shouldStop: () => stopPollRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dubJob?.jobId, session]);

  // Tear down the poll loop on unmount without clearing the persisted job.
  React.useEffect(() => {
    return () => {
      stopPollRef.current = true;
      runningRef.current = false;
    };
  }, []);

  return {
    dub,
    dubAligned,
    jobState,
    progress,
    running,
    error,
    previewDubSource,
    setPreviewDubSource,
    canRun,
    blockedReason,
    run,
    setDubTrack,
    setDubTiming,
  };
}
