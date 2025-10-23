import { formatTime } from "@/app/lib/dateTimeUtils";

interface RecordingTimelineProps {
  recordingTimer: number;
}

export default function RecordingTimeline({
  recordingTimer,
}: RecordingTimelineProps) {
  return (
    <div className="w-full px-6 pb-4 pt-2 flex flex-col gap-2">
      <div className="flex justify-end items-center gap-3">
        <span className="text-xs text-red-500 font-mono min-w-[60px] text-right font-bold">
          {formatTime(recordingTimer)}
        </span>
      </div>

      {/* Recording status */}
      <div className="flex items-center justify-between mt-2 px-2 w-full">
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-500 font-semibold animate-pulse">
            ⏺ Recording in progress...
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-mono">Live Preview</span>
        </div>
      </div>
    </div>
  );
}
