import { useEffect } from "react";

interface UseTimelineInitProps {
  duration: number;
  timelineEndTime: number;
  setTimelineStartTime: (time: number) => void;
  setInputStartTime: (time: string) => void;
  setTimelineEndTime: (time: number) => void;
  setInputEndTime: (time: string) => void;
  formatTimeForInput: (seconds: number) => string;
}

export function useTimelineInit({
  duration,
  timelineEndTime,
  setTimelineStartTime,
  setInputStartTime,
  setTimelineEndTime,
  setInputEndTime,
  formatTimeForInput,
}: UseTimelineInitProps) {
  // Initialize timeline pointers when video duration is loaded (only once)
  useEffect(() => {
    if (duration > 0 && timelineEndTime === 0) {
      setTimelineStartTime(0);
      setInputStartTime(formatTimeForInput(0));
      const initialEndTime = duration;
      setTimelineEndTime(initialEndTime);
      setInputEndTime(formatTimeForInput(initialEndTime));
      console.log("Initialized timeline pointers:", {
        start: 0,
        end: initialEndTime,
      });
    }
  }, [
    duration,
    timelineEndTime,
    setTimelineStartTime,
    setInputStartTime,
    setTimelineEndTime,
    setInputEndTime,
    formatTimeForInput,
  ]);
}