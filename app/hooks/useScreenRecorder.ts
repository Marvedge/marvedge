// "use client";
// import { useRef, useState } from "react";
// import { useBlobStore } from "../lib/blobStore";

// export const useScreenRecorder = () => {
//   const mediaRecorder = useRef<MediaRecorder | null>(null);
//   const streamRef = useRef<MediaStream | null>(null);
//   const [recording, setRecording] = useState(false);
//   const [videoUrl, setVideoUrl] = useState<string | null>(null);
//   const [micEnabled, setMicEnabled] = useState(false);
//   const setBlob = useBlobStore((state) => state.setBlob);

//   const toggleMic = () => setMicEnabled((prev) => !prev);

//   const startRecording = async () => {
//     try {
//       const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
//       let micStream: MediaStream | null = null;

//       if (micEnabled) {
//         try {
//           micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
//         } catch (err) {
//           console.warn("Mic access denied:", err);
//         }
//       }

//       const combinedStream = new MediaStream([
//         ...screenStream.getVideoTracks(),
//         ...screenStream.getAudioTracks(),
//         ...(micStream ? micStream.getAudioTracks() : []),
//       ]);

//       streamRef.current = combinedStream;
//       const chunks: Blob[] = [];

//       mediaRecorder.current = new MediaRecorder(combinedStream, {
//         mimeType: "video/webm; codecs=vp8,opus",
//       });

//       mediaRecorder.current.ondataavailable = (e) => {
//         if (e.data.size > 0) chunks.push(e.data);
//       };

//       mediaRecorder.current.onstop = () => {
//         const blob = new Blob(chunks, { type: "video/webm" });
//         const url = URL.createObjectURL(blob);
//         setBlob(blob);
//         setVideoUrl(url);
//         combinedStream.getTracks().forEach((track) => track.stop());
//       };

//       mediaRecorder.current.start();
//       setRecording(true);
//     } catch (err) {
//       console.error("Recording failed:", err);
//     }
//   };

//   const stopRecording = () => {
//     mediaRecorder.current?.stop();
//     setRecording(false);
//   };

//   return {
//     startRecording,
//     stopRecording,
//     toggleMic,
//     micEnabled,
//     recording,
//     videoUrl,
//   };
// };

"use client";
import { useRef, useState } from "react";
import { useBlobStore } from "../lib/blobStore";

export const useScreenRecorder = () => {
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const setBlob = useBlobStore((state) => state.setBlob);

  const toggleMic = () => setMicEnabled((prev) => !prev);

  const startScreenShare = async () => {
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      screenStreamRef.current = screen;
      setScreenStream(screen);
    } catch (err) {
      console.error("Failed to get screen stream:", err);
    }
  };

  const startRecording = async () => {
    try {
      if (!screenStreamRef.current) return;

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

      const combinedStream = new MediaStream([
        ...screenStreamRef.current.getVideoTracks(),
        ...screenStreamRef.current.getAudioTracks(),
        ...(micStream ? micStream.getAudioTracks() : []),
      ]);

      const chunks: Blob[] = [];

      mediaRecorder.current = new MediaRecorder(combinedStream, {
        mimeType: "video/webm; codecs=vp8,opus",
      });

      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.current.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        setBlob(blob);
        setVideoUrl(url);
        combinedStream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.current.start();
      setRecording(true);
    } catch (err) {
      console.error("Recording failed:", err);
    }
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    setRecording(false);
  };

  const reset = () => {
    setVideoUrl(null);
    setScreenStream(null);
    screenStreamRef.current = null;
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
    reset,
  };
};

