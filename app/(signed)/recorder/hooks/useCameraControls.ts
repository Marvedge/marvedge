import { useState, useRef } from "react";

export function useCameraControls() {
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [enableCamera, setEnableCamera] = useState(false);
  const videoPreview = useRef<HTMLVideoElement>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      setCameraStream(stream);
      if (videoPreview.current) {
        videoPreview.current.srcObject = stream;
      }
    } catch (error) {
      console.error("Camera access denied or not available:", error);
    }
  };

  const stopCamera = () => {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
    if (videoPreview.current) videoPreview.current.srcObject = null;
  };

  return {
    cameraStream,
    enableCamera,
    setEnableCamera,
    videoPreview,
    startCamera,
    stopCamera,
  };
}
