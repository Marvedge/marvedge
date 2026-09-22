import React, { useEffect } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { useShallow } from "zustand/react/shallow";

import { uploadBlobToGcs } from "@/app/lib/gcsUploadClient";
import { AUTO_DETECT_LANGUAGE, findActiveCue, validateSubtitleDuration } from "@/app/lib/subtitles";
import { useSubtitleStore } from "@/app/store/editor/subtitleStore";
import { SubtitleCue } from "../types";
import type { EditorState } from "../apiTypes";

interface UseSubtitlesProps {
  editorState: EditorState;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 180;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Read cues out of the `?subtitles=` URL param, tolerating both a bare array and
 * the legacy `{ cues }` wrapper.
 *
 * `null` means "no usable param" — absent, unparseable, or not carrying an array
 * — and the caller leaves the editor's current cues alone. An empty array means
 * the param DID carry a cue list and it was empty, which is applied like any
 * other value. Preserving that distinction is what keeps a demo opened without
 * the param from having its cues wiped.
 *
 * Lifted out of the effect verbatim; the coercion is unchanged. It stays here
 * rather than moving to app/lib/subtitles because this is a URL-transport
 * concern, not cue algebra, and `readCueList` there already covers the shape
 * tolerance for persisted values.
 */
function parseSubtitlesParam(raw: string | null): SubtitleCue[] | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;

    let cues: unknown = null;
    if (Array.isArray(parsed)) {
      cues = parsed;
    } else if (typeof parsed === "object" && parsed && "cues" in parsed) {
      cues = (parsed as { cues?: unknown }).cues ?? null;
    }
    if (!Array.isArray(cues)) {
      return null;
    }

    return cues
      .map((c) => {
        if (typeof c !== "object" || !c) {
          return null;
        }
        const rec = c as Record<string, unknown>;
        const start = Number(rec.start);
        const end = Number(rec.end);
        const text = String(rec.text ?? "").trim();
        if (!Number.isFinite(start) || !Number.isFinite(end) || !text) {
          return null;
        }
        return { start, end, text } satisfies SubtitleCue;
      })
      .filter(
        (c): c is SubtitleCue =>
          !!c && Number.isFinite(c.start) && Number.isFinite(c.end) && c.text.length > 0
      );
  } catch (e) {
    console.error("Failed to parse subtitles from URL:", e);
    return null;
  }
}

/** How a poll loop ended. `cancelled` is a user decision, not a failure. */
type PollOutcome =
  | { status: "completed"; cues: SubtitleCue[] }
  | { status: "cancelled" }
  | { status: "failed"; error: string };

/**
 * Poll /api/jobs/{id} until the subtitle job settles.
 *
 * Module-level rather than inline so the generate handler stays readable, and so
 * the cancellation contract is stated in one place: `isCancelled` is consulted
 * before every request, which is what makes Cancel feel immediate even though
 * the worker keeps running. It reads a ref — a `useState` value captured by this
 * closure would never change for the loop's whole life.
 */
async function pollSubtitleJob(jobId: string, isCancelled: () => boolean): Promise<PollOutcome> {
  for (let pollCount = 0; pollCount < MAX_POLLS; pollCount++) {
    if (isCancelled()) {
      return { status: "cancelled" };
    }
    const statusRes = await axios.get(`/api/jobs/${jobId}`);
    const state = statusRes.data?.state as string | undefined;

    if (state === "completed") {
      const cues = statusRes.data?.subtitles;
      return { status: "completed", cues: Array.isArray(cues) ? (cues as SubtitleCue[]) : [] };
    }
    // The job can also be cancelled from elsewhere (another tab, a second editor
    // session), so the server's word counts too, not just the local flag.
    if (state === "cancelled") {
      return { status: "cancelled" };
    }
    if (state === "failed") {
      return { status: "failed", error: statusRes.data?.error || "Subtitle generation failed" };
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return { status: "failed", error: "Subtitle generation timed out" };
}

/**
 * Resolves the source URL to pass to /api/subtitles/create.
 *
 * Invariant (Task-00044 & Task-00047):
 * - HTTPS videoUrl (including Cloudinary HTTPS URLs from upload or auto-reframe):
 *   passed directly to /api/subtitles/create; uploadBlobToGcs() is NEVER called.
 * - blob: URLs: preserve existing production GCS fallback.
 */
export async function resolveSubtitleSourceUrl(videoUrl: string): Promise<string> {
  if (videoUrl.startsWith("blob:")) {
    const resp = await fetch(videoUrl);
    if (!resp.ok) {
      throw new Error("Failed to read recorded video blob");
    }
    const blob = await resp.blob();
    const upload = await uploadBlobToGcs({
      blob,
      filename: "subtitle_source.webm",
      kind: "subtitle-source",
    });
    return upload.url;
  }
  return videoUrl;
}

export function useSubtitles({ editorState }: UseSubtitlesProps) {
  const { params, videoUrl, currentTime, savedDemoId, duration } = editorState;
  const {
    subtitleCues,
    subtitlesLoading,
    subtitleStyle,
    subtitleLanguage,
    generationLanguage,
    setSubtitleCues,
    setSubtitlesLoading,
    setSubtitleStyle,
    setSubtitleLanguage,
    setGenerationLanguage,
  } = useSubtitleStore(
    useShallow((s) => ({
      subtitleCues: s.subtitleCues,
      subtitlesLoading: s.subtitlesLoading,
      subtitleStyle: s.subtitleStyle,
      subtitleLanguage: s.subtitleLanguage,
      generationLanguage: s.generationLanguage,
      setSubtitleCues: s.setSubtitleCues,
      setSubtitlesLoading: s.setSubtitlesLoading,
      setSubtitleStyle: s.setSubtitleStyle,
      setSubtitleLanguage: s.setSubtitleLanguage,
      setGenerationLanguage: s.setGenerationLanguage,
    }))
  );

  useEffect(() => {
    const cues = params ? parseSubtitlesParam(params.get("subtitles")) : null;
    if (cues) {
      setSubtitleCues(cues);
    }
  }, [params, setSubtitleCues]);

  // The binary search lives in app/lib/subtitles so the preview, the editor
  // panel and the export path all agree on which cue is on screen at a time.
  const activeSubtitleText = React.useMemo(
    () => findActiveCue(subtitleCues, currentTime)?.text ?? "",
    [subtitleCues, currentTime]
  );

  /**
   * The job currently being polled, and whether the user has asked to stop
   * waiting on it.
   *
   * Refs rather than state because the poll loop below is a plain `for` inside
   * one async function: it closes over whatever these held when it started, so a
   * `useState` value would stay `false` for the loop's whole life no matter what
   * the user clicked. The ref is the only thing a running loop can observe.
   */
  const jobIdRef = React.useRef<string | null>(null);
  const cancelledRef = React.useRef(false);
  const [cancelling, setCancelling] = React.useState(false);

  /**
   * Tell the server to discard a job's result. Failure is logged, not toasted:
   * the local half of the cancel has already happened and the user has what they
   * asked for — what is lost is the server-side discard, and only for a job that
   * was about to finish anyway.
   */
  const postCancel = React.useCallback(async (jobId: string) => {
    try {
      await axios.post("/api/subtitles/cancel", { jobId });
    } catch (e) {
      console.error("Failed to cancel subtitle job:", e);
    }
  }, []);

  /**
   * Stop waiting on the running job.
   *
   * The Cloud Run call cannot be aborted — it runs to completion and its cues
   * are thrown away server-side (see /api/subtitles/cancel). What this gives the
   * user is the editor back immediately, and a guarantee that a transcript they
   * no longer want will not appear over their demo minutes from now.
   *
   * The flag is set even when there is no job id yet — Cancel is reachable while
   * the source blob is still uploading, before the job exists. The generate flow
   * checks the flag as soon as it HAS an id and sends the cancel then, so a
   * click in that window is not silently dropped.
   */
  const handleCancelSubtitles = React.useCallback(async () => {
    if (cancelledRef.current) {
      return;
    }
    // Set before the request: the poll loop should stop on the next tick even if
    // the cancel call itself is slow or fails.
    cancelledRef.current = true;
    setCancelling(true);
    const jobId = jobIdRef.current;
    if (!jobId) {
      return; // Cleared by the generate flow's `finally`.
    }
    try {
      await postCancel(jobId);
    } finally {
      setCancelling(false);
    }
  }, [postCancel]);

  const handleAddSubtitles = async (overrideUrl?: string) => {
    const activeUrl = overrideUrl || videoUrl;
    if (!activeUrl) {
      toast.error("No video available for subtitles");
      return;
    }
    if (subtitlesLoading) {
      return;
    }

    // PRD §13 — refuse a video past the ceiling here rather than letting the
    // user wait out a transcription that will be rejected server-side anyway.
    // An unmeasured duration (the player has not loaded metadata yet) passes.
    const durationCheck = validateSubtitleDuration(duration);
    if (!durationCheck.ok) {
      toast.error(durationCheck.error);
      return;
    }

    const toastId = toast.loading("Generating subtitles...");
    setSubtitlesLoading(true);
    cancelledRef.current = false;
    jobIdRef.current = null;
    try {
      if (activeUrl.startsWith("blob:")) {
        toast.loading("Uploading audio source...", { id: toastId });
      }
      const subtitleSourceUrl = await resolveSubtitleSourceUrl(activeUrl);

      // SUB PR 5: the chosen generation language, replacing a hardcoded
      // "multi". The store's default IS "multi", so a user who never opens the
      // picker sends exactly what this hook has always sent.
      const requestedLanguage = generationLanguage || AUTO_DETECT_LANGUAGE;
      const createRes = await axios.post("/api/subtitles/create", {
        videoUrl: subtitleSourceUrl,
        demoId: savedDemoId || null,
        language: requestedLanguage,
        // What the player measured, so the route can apply the PRD §13 ceiling
        // and scale the worker timeout. Omitted when it is still 0 — the server
        // treats an unknown duration as acceptable.
        durationSeconds: duration > 0 ? duration : null,
      });
      const jobId = createRes.data?.jobId as string | undefined;
      if (!jobId) {
        throw new Error("No subtitle job ID returned");
      }
      jobIdRef.current = jobId;

      // The user hit Cancel while the source was uploading or the create call
      // was in flight — before there was a job id to send one for. Now there is.
      if (cancelledRef.current) {
        await postCancel(jobId);
        toast("Subtitle generation cancelled", { id: toastId });
        return;
      }

      const outcome = await pollSubtitleJob(jobId, () => cancelledRef.current);

      if (outcome.status === "cancelled") {
        cancelledRef.current = true;
        toast("Subtitle generation cancelled", { id: toastId });
        return;
      }
      if (outcome.status === "failed") {
        throw new Error(outcome.error);
      }

      setSubtitleCues(outcome.cues);
      // The generated cues ARE the active track now, so the active language
      // follows the run that produced them — this is what drives RTL in the
      // preview and the burn-in.
      setSubtitleLanguage(requestedLanguage);
      // PRD §13 — a silent video transcribes to nothing, and the job SUCCEEDS.
      // Reporting "Subtitles ready" over an empty cue list sends the user
      // hunting the editor for subtitles that were never produced. Same
      // distinction the AVS captions flow already draws.
      if (outcome.cues.length === 0) {
        toast.error("No speech detected in this video", { id: toastId });
      } else {
        toast.success("Subtitles ready", { id: toastId });
      }
    } catch (e: unknown) {
      // A cancel is not a failure — the user asked for this and has already been
      // told it happened.
      if (cancelledRef.current) {
        toast.dismiss(toastId);
        return;
      }
      console.error(e);
      // Prefer the server's message: the route explains WHY (too long,
      // unsupported language, unreadable file), where the axios default is a
      // bare status code.
      const message =
        axios.isAxiosError(e) && typeof e.response?.data?.error === "string"
          ? e.response.data.error
          : e instanceof Error
            ? e.message
            : "Failed to generate subtitles";
      toast.error(message, { id: toastId });
    } finally {
      setSubtitlesLoading(false);
      setCancelling(false);
      jobIdRef.current = null;
    }
  };

  const handleSkipSubtitles = React.useCallback(() => {
    setSubtitleCues([]);
    toast.success("Subtitles skipped for export");
  }, [setSubtitleCues]);

  return {
    subtitleCues,
    setSubtitleCues,
    subtitlesLoading,
    // SUB PR 4: the demo's persisted appearance. `null` until the style panel is
    // touched, which is what keeps an untouched demo's export byte-identical.
    subtitleStyle,
    setSubtitleStyle,
    // SUB PR 5: the language axis. `subtitleLanguage` is the ACTIVE track's
    // language and reaches the export recipe (it decides RTL);
    // `generationLanguage` is only what the next run will ask for.
    subtitleLanguage,
    setSubtitleLanguage,
    generationLanguage,
    setGenerationLanguage,
    activeSubtitleText,
    handleAddSubtitles,
    handleSkipSubtitles,
    // SUB PR 7: stop waiting on a running job (PRD §13). The worker call itself
    // cannot be aborted — the result is discarded instead.
    handleCancelSubtitles,
    cancelling,
  };
}
