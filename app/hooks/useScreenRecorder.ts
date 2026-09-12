"use client";
import { useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useBlobStore } from "../store/blobStore";
import { useRecordingStore } from "../store/recordingStore";
import { toast } from "sonner";
import { useWebcamRecorder } from "./useWebcamRecorder";

// Build a combined screen + audio MediaStream. A silent oscillator is added
// when no real audio source exists so the recording always has a valid audio
// track (FFmpeg's stream-copy trim needs audio timestamps for correct duration).
const buildCombinedStream = async (
  screenStream: MediaStream,
  micEnabled: boolean
): Promise<MediaStream> => {
  const audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();

  let micStream: MediaStream | null = null;
  if (micEnabled) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.warn("Mic access denied:", err);
    }
  }

  let hasAudioSource = false;

  if (screenStream.getAudioTracks().length > 0) {
    const tabSource = audioContext.createMediaStreamSource(
      new MediaStream(screenStream.getAudioTracks())
    );
    tabSource.connect(destination);
    hasAudioSource = true;
  }
  if (micStream) {
    const micSource = audioContext.createMediaStreamSource(micStream);
    micSource.connect(destination);
    hasAudioSource = true;
  }

  if (!hasAudioSource) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    gain.gain.value = 0; // complete silence
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start();
  }

  return new MediaStream([
    ...screenStream.getVideoTracks(),
    ...destination.stream.getAudioTracks(),
  ]);
};

const pickRecorderMimeType = (): string =>
  MediaRecorder.isTypeSupported("video/webm; codecs=vp8,opus")
    ? "video/webm; codecs=vp8,opus"
    : MediaRecorder.isTypeSupported("video/webm")
      ? "video/webm"
      : "";

const createMediaRecorder = (stream: MediaStream): MediaRecorder => {
  const mimeType = pickRecorderMimeType();
  return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
};

const reportScreenShareError = (err: unknown) => {
  if (err instanceof Error) {
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      console.log("User denied screen share.");
    } else {
      console.warn("Screen share failed:", err);
      toast.error("Screen share failed. Please try again.");
    }
  } else {
    console.warn("Screen share failed with unknown error:", err);
    toast.error("Screen share failed. Please try again.");
  }
};

// Notifies the companion browser extension when capture starts/stops.
const postCaptureMessage = (
  action: "START_CAPTURE" | "STOP_CAPTURE",
  extra?: Record<string, unknown>
) => {
  if (typeof window === "undefined") {
    return;
  }
  window.postMessage({ source: "marvedge-web", action, ...extra }, window.location.origin);
};

// Every recording-store binding the recorder needs, gathered in one place.
const useRecordingBindings = () => {
  const state = useRecordingStore(
    useShallow((s) => ({
      recording: s.recording,
      videoUrl: s.videoUrl,
      micEnabled: s.micEnabled,
      screenStream: s.screenStream,
      recordingDuration: s.recordingDuration,
      showScreenShareModal: s.showScreenShareModal,
    }))
  );
  const setRecording = useRecordingStore((s) => s.setRecording);
  const setVideoUrl = useRecordingStore((s) => s.setVideoUrl);
  const toggleMic = useRecordingStore((s) => s.toggleMic);
  const setScreenStream = useRecordingStore((s) => s.setScreenStream);
  const setRecordingDuration = useRecordingStore((s) => s.setRecordingDuration);
  const setShowScreenShareModal = useRecordingStore((s) => s.setShowScreenShareModal);
  const resetRecordingState = useRecordingStore((s) => s.reset);

  return {
    ...state,
    setRecording,
    setVideoUrl,
    toggleMic,
    setScreenStream,
    setRecordingDuration,
    setShowScreenShareModal,
    resetRecordingState,
  };
};

export const useScreenRecorder = () => {
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const combinedStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const hasFinalizedRef = useRef(false);
  const recorderMimeTypeRef = useRef("video/webm");
  const recordingStartTimeRef = useRef<number>(0);

  // Camera bubble (WTM-6.4): a self-contained second recorder that no-ops when
  // the feature flag is off or the user never enabled the camera.
  const webcamRecorder = useWebcamRecorder();

  const {
    recording,
    videoUrl,
    micEnabled,
    screenStream,
    recordingDuration,
    showScreenShareModal,
    setRecording,
    setVideoUrl,
    toggleMic,
    setScreenStream,
    setRecordingDuration,
    setShowScreenShareModal,
    resetRecordingState,
  } = useRecordingBindings();

  const setBlob = useBlobStore((state) => state.setBlob);
  const setSourceDuration = useBlobStore((state) => state.setSourceDuration);

  const finalizeRecording = () => {
    if (hasFinalizedRef.current) {
      return;
    }
    hasFinalizedRef.current = true;
    // Stop the camera in lockstep with the screen recorder.
    webcamRecorder.stop();

    if (chunksRef.current.length > 0) {
      const blob = new Blob(chunksRef.current, { type: recorderMimeTypeRef.current });
      const url = URL.createObjectURL(blob);
      setBlob(blob);
      setVideoUrl(url);
    }

    const endTime = Date.now();
    const actualDuration = (endTime - recordingStartTimeRef.current) / 1000;
    if (actualDuration > 0) {
      setRecordingDuration(actualDuration);
      setSourceDuration(actualDuration);
    }

    combinedStreamRef.current?.getTracks().forEach((track) => track.stop());
    combinedStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    setRecording(false);

    postCaptureMessage("STOP_CAPTURE");
  };

  const startRecording = async () => {
    try {
      if (!screenStreamRef.current) {
        return;
      }

      const combinedStream = await buildCombinedStream(screenStreamRef.current, micEnabled);
      combinedStreamRef.current = combinedStream;
      chunksRef.current = [];
      hasFinalizedRef.current = false;

      mediaRecorder.current = createMediaRecorder(combinedStream);
      recorderMimeTypeRef.current = mediaRecorder.current.mimeType || "video/webm";

      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.current.onstop = () => {
        finalizeRecording();
      };

      // Armed before the screen recorder starts so both begin in the same tick.
      const startCameraRecorder = webcamRecorder.prepare();

      mediaRecorder.current.start(250);
      startCameraRecorder?.();
      setRecording(true);
      recordingStartTimeRef.current = Date.now();
      setRecordingDuration(0);

      postCaptureMessage("START_CAPTURE", { demoId: `rec_${Date.now()}` });
    } catch (err) {
      console.error("Recording failed:", err);
      toast.error("Recording failed to start.");
    }
  };

  const startScreenShare = async () => {
    handleConfirmScreenShare("window");
  };

  const handleConfirmScreenShare = async (shareType: "window" | "screen") => {
    setShowScreenShareModal(false);

    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: shareType === "window" ? "window" : "monitor",
        },
        audio: true,
      });

      const [videoTrack] = screen.getVideoTracks();
      if (videoTrack) {
        videoTrack.onended = () => {
          stopRecording(false);
        };
      }

      screenStreamRef.current = screen;
      setScreenStream(screen);
      toast.success("Screen sharing started!");

      await startRecording();
    } catch (err: unknown) {
      reportScreenShareError(err);
    }
  };

  const stopRecording = (showToast = true) => {
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      mediaRecorder.current.stop();
    } else {
      finalizeRecording();
    }
    if (showToast) {
      toast("Recording stopped", { icon: "⏹️" });
    }
  };

  const reset = () => {
    resetRecordingState();
    screenStreamRef.current = null;
    setSourceDuration(0);
    // The take was discarded, so its webcam clip must not survive into the next.
    webcamRecorder.discard();
  };

  return {
    startScreenShare,
    startRecording,
    stopRecording,
    toggleMic,
    micEnabled,
    recording,
    videoUrl,
    screenStream,
    recordingDuration,
    reset,
    showScreenShareModal,
    setShowScreenShareModal,
    handleConfirmScreenShare,
  };
};

// the main issue leading to the editor page was it always expected me to provide a audio and when it was not there
// it produced an error and i was not able to proceed to the editor page
// so i have to make sure that the audio is optional and if it is not there then it should not produce an error
// and it should work fine

// still not fixed and keeps failing , there is a deeper issue with this that needs to be fixed
// i am not sure if it is a browser issue or a code issue , kya ho rha hai bhai
