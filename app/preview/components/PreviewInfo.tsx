"use client";
import { formatTime, getVideoFormatLabel } from "../utils/previewHelpers";

interface PreviewInfoProps {
  title: string;
  description: string;
  duration: number;
  videoUrl: string;
}

export default function PreviewInfo({ title, description, duration, videoUrl }: PreviewInfoProps) {
  return (
    <div className="mt-8 bg-white rounded-2xl p-6 shadow-lg">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">{title}</h2>
      {description && <p className="text-gray-600 leading-relaxed">{description}</p>}
      <div className="mt-4 flex items-center space-x-4 text-sm text-gray-500">
        <span>Duration: {formatTime(duration)}</span>
        <span>Format: {videoUrl ? getVideoFormatLabel(videoUrl) : "Not Found"}</span>
      </div>
    </div>
  );
}
