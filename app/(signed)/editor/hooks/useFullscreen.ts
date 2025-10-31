import { useEffect, useCallback } from "react";

interface UseFullscreenProps {
  videoContainerRef: React.RefObject<HTMLDivElement | null>;
  setIsFullscreen: (isFullscreen: boolean) => void;
}

export function useFullscreen({
  videoContainerRef,
  setIsFullscreen,
}: UseFullscreenProps) {
  const handleFullscreen = useCallback(() => {
    const el = videoContainerRef.current;
    console.log("Fullscreen button clicked", { el });
    if (!el) {
      alert("Video container not found.");
      return;
    }

    // Enter fullscreen
    if (
      !document.fullscreenElement &&
      !(
        "webkitFullscreenElement" in document &&
        (document as Document & { webkitFullscreenElement?: Element })
          .webkitFullscreenElement
      ) &&
      !(
        "msFullscreenElement" in document &&
        (document as Document & { msFullscreenElement?: Element })
          .msFullscreenElement
      )
    ) {
      if (el.requestFullscreen) {
        el.requestFullscreen().catch((err) => {
          alert("Failed to enter fullscreen: " + err.message);
          console.error("Fullscreen error:", err);
        });
      } else if ("webkitRequestFullscreen" in el) {
        (
          el as HTMLElement & { webkitRequestFullscreen?: () => void }
        ).webkitRequestFullscreen?.();
      } else if ("msRequestFullscreen" in el) {
        (
          el as HTMLElement & { msRequestFullscreen?: () => void }
        ).msRequestFullscreen?.();
      } else {
        alert("Fullscreen API is not supported in this browser.");
        console.error("Fullscreen API not supported");
      }
    } else {
      // Exit fullscreen
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ("webkitExitFullscreen" in document) {
        (
          document as Document & { webkitExitFullscreen?: () => void }
        ).webkitExitFullscreen?.();
      } else if ("msExitFullscreen" in document) {
        (
          document as Document & { msExitFullscreen?: () => void }
        ).msExitFullscreen?.();
      } else {
        alert("Cannot exit fullscreen: API not supported.");
        console.error("Exit Fullscreen API not supported");
      }
    }
  }, [videoContainerRef]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, [setIsFullscreen]);

  return { handleFullscreen };
}
