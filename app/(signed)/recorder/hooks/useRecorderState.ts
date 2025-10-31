import { useState, useRef, useEffect } from "react";

export function useRecorderState() {
  const [uploadMessage, setUploadMessage] = useState<string>("");
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [uploadedFileType, setUploadedFileType] = useState<string | null>(null);
  const [format, setFormat] = useState<"webm" | "mp4">("webm");
  const [saveMessage] = useState<string>("");
  const [recordingTimer, setRecordingTimer] = useState(0);
  const [showSavePopup, setShowSavePopup] = useState(false);
  const [processingDownload, setProcessingDownload] = useState(false);

  // Video controls state
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  return {
    uploadMessage,
    setUploadMessage,
    uploadedFileUrl,
    setUploadedFileUrl,
    uploadedFileType,
    setUploadedFileType,
    format,
    setFormat,
    saveMessage,
    recordingTimer,
    setRecordingTimer,
    showSavePopup,
    setShowSavePopup,
    processingDownload,
    setProcessingDownload,
    videoPlaying,
    setVideoPlaying,
    videoCurrentTime,
    setVideoCurrentTime,
    videoDuration,
    setVideoDuration,
    sidebarOpen,
    setSidebarOpen,
    fileInputRef,
    recordingIntervalRef,
  };
}

export function useRecordingTimer(
  recording: boolean,
  recordingIntervalRef: React.MutableRefObject<NodeJS.Timeout | null>,
  setRecordingTimer: (value: number | ((prev: number) => number)) => void,
) {
  // Enhanced initialization
  useEffect(() => {
    setRecordingTimer(0);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
  }, [recordingIntervalRef, setRecordingTimer]);

  // Improved recording timer logic
  useEffect(() => {
    if (recording) {
      setRecordingTimer(0); // Reset to 0 when recording starts

      // Clear existing interval first
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }

      // Start new interval after delay to ensure recording is active
      const timer = setTimeout(() => {
        recordingIntervalRef.current = setInterval(() => {
          setRecordingTimer((prev) => prev + 1);
        }, 1000);
      }, 100);

      return () => {
        clearTimeout(timer);
        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current);
          recordingIntervalRef.current = null;
        }
      };
    } else {
      // Stop and reset timer
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
      setRecordingTimer(0);
    }
  }, [recording, recordingIntervalRef, setRecordingTimer]);
}
