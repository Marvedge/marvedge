"use client";
import { useRef, useState } from "react";
import { useBlobStore } from "../store/blobStore";
import { toast } from "sonner";

export const useScreenRecorder = () => {
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showScreenShareModal, setShowScreenShareModal] = useState(false);
  const recordingStartTimeRef = useRef<number>(0);
  const setBlob = useBlobStore((state) => state.setBlob);

  const toggleMic = () => setMicEnabled((prev) => !prev);

  const startRecording = async () => {
    try {
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      if (!screenStreamRef.current) {
        return;
      }

      let micStream: MediaStream | null = null;

      if (micEnabled) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
        } catch (err) {
          console.warn("Mic access denied:", err);
        }
      }

      if (screenStreamRef.current.getAudioTracks().length > 0) {
        const tabSource = audioContext.createMediaStreamSource(
          new MediaStream(screenStreamRef.current.getAudioTracks())
        );
        tabSource.connect(destination);
      }
      if (micStream) {
        const micSource = audioContext.createMediaStreamSource(micStream);
        micSource.connect(destination);
      }

      const combinedStream = new MediaStream([
        ...screenStreamRef.current.getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ]);

      const chunks: Blob[] = [];

      mediaRecorder.current = new MediaRecorder(combinedStream, {
        mimeType: "video/webm; codecs=vp8,opus",
      });

      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.current.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        setBlob(blob);
        setVideoUrl(url);

        // Calculate and set the actual recording duration
        const endTime = Date.now();
        const actualDuration = (endTime - recordingStartTimeRef.current) / 1000;
        setRecordingDuration(actualDuration);

        combinedStream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.current.start();
      setRecording(true);
      recordingStartTimeRef.current = Date.now();
      setRecordingDuration(0);
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

      screenStreamRef.current = screen;
      setScreenStream(screen);
      toast.success("Screen sharing started!");

      await startRecording();
    } catch (err: unknown) {
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
    }
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    setRecording(false);
    toast("Recording stopped", { icon: "⏹️" });
  };

  const reset = () => {
    setVideoUrl(null);
    setScreenStream(null);
    screenStreamRef.current = null;
    setRecordingDuration(0);
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
