import { useEffect, useRef, useState } from "react";

import { qrViewSource } from "@/app/lib/share/qrTarget";

export function useViewTracking(demoId?: string, videoId?: string) {
  const [viewId, setViewId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const watchedDurationRef = useRef<number>(0);

  useEffect(() => {
    // Where this view came from. A QR encodes the share URL with `?src=qr`, so a
    // scan is distinguishable from a link click; anything else is left off the
    // payload entirely rather than sent as "direct", which keeps the request
    // byte-identical to what it was before QR existed.
    const source = qrViewSource(window.location.search);

    // Record a view when the page loads
    fetch("/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demoId, exportedVideoId: videoId, ...(source ? { source } : {}) }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.viewId && data.viewId !== "deduped") {
          setViewId(data.viewId);
        }
      })
      .catch(console.error);
  }, [demoId, videoId]);

  useEffect(() => {
    if (!viewId) {
      return;
    }

    // Periodically update the view duration on the server if the video is playing
    const interval = setInterval(() => {
      const vid = videoRef.current;
      if (vid && !vid.paused) {
        // Simple heuristic: just increment by the interval duration
        // (A more robust way would be to track actual played ranges)
        watchedDurationRef.current += 5;
        fetch("/api/views", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            viewId,
            duration: watchedDurationRef.current,
            demoId,
            exportedVideoId: videoId,
          }),
        }).catch(console.error);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [viewId, demoId, videoId]);

  return videoRef;
}
