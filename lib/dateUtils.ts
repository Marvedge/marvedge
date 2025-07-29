// Utility functions for date and time formatting

export interface ZoomEffect {
  id: string;
  startTime: number;
  endTime: number;
  zoomLevel: number;
  x: number;
  y: number;
}

/**
 * Default time formatter that converts seconds to HH:MM:SS format
 * @param seconds - Time in seconds
 * @returns Formatted time string
 */
export const defaultFormatTime = (seconds: number): string => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

/**
 * Toggle zoom effect function
 * @param onZoomEffectCreate - Callback to create zoom effect
 * @param currentTime - Current video time
 * @param duration - Video duration
 * @param setzoomed - State setter for zoomed status
 * @returns void
 */
export const toggleZoom = (
  onZoomEffectCreate: ((effect: ZoomEffect) => void) | undefined,
  currentTime: number,
  duration: number,
  setzoomed: (value: boolean | ((prev: boolean) => boolean)) => void
): void => {
  if (onZoomEffectCreate) {
    const testEffect: ZoomEffect = {
      id: Date.now().toString(),
      startTime: Math.max(0, currentTime - 1),
      endTime: Math.min(duration, currentTime + 2),
      zoomLevel: 2.0,
      x: 0.5,
      y: 0.5,
    };
    onZoomEffectCreate(testEffect);
  }
  setzoomed((z) => !z);
}; 