"use client";

import React, { useRef, useState } from "react";
import { Loader2, Music, Upload } from "lucide-react";
import { toast } from "react-hot-toast";

import { useDubbing, type Dubbing } from "./useDubbing";
import { readAudioFileDuration, uploadDubFile } from "@/app/lib/dubbing/upload";
import type { DubJobState } from "@/app/lib/dubbing/normalize";
import { useEditorStore } from "@/app/store/editor/editorStore";

const ACCEPTED = ".mp3,.wav,.m4a,.ogg";
const btnBase =
  "flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

const STATE_LABEL: Record<DubJobState, string> = {
  pending: "Queued",
  processing: "Aligning…",
  completed: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
  unknown: "Working…",
};

/**
 * Dubbing (Task-00052) sidebar section, rendered inside the AVS panel so it
 * inherits the same NEXT_PUBLIC_AVS_ENABLED gate. Backend access is open to
 * every signed-in plan for now (see POST /api/avs/dub). Uploads a pre-recorded
 * dub track, lets the user mark each step's slice of that track, and runs
 * POST /api/avs/dub while it polls the job — then the completed dub becomes
 * the preview source.
 */
const DubbingPanel: React.FC = () => {
  const d = useDubbing();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const savedDemoId = useEditorStore((s) => s.savedDemoId);
  const avsState = useEditorStore((s) => s.avs);
  const steps = avsState?.steps ?? [];

  const handleFile = async (file: File) => {
    if (!savedDemoId) {
      toast.error("Save the demo first, then upload the dub track.");
      return;
    }
    if (uploading) {
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    try {
      const duration = await readAudioFileDuration(file);
      const uploaded = await uploadDubFile(savedDemoId, file, duration ?? 0, setUploadProgress);
      d.setDubTrack({
        dubUrl: uploaded.url,
        duration: uploaded.duration,
        dubTimings: d.dub?.dubTimings ?? [],
      });
      toast.success(`Dub track "${file.name}" ready`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Upload failed";
      setUploadError(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="border-t border-[#ede7fa] pt-6 space-y-4">
      <div>
        <h2 className="control-block-label text-lg font-bold text-[#A594F9] mb-1">Dubbing</h2>
        <p className="text-xs text-[#6B6B6B] dark:text-inherit mb-4">
          Upload a pre-recorded voice track, mark where each step starts in it, and time-stretch the
          video to match the dub.
        </p>
      </div>

      <DubTrackUpload
        dub={d.dub}
        onUpload={handleFile}
        onClear={() => d.setDubTrack(null)}
        uploading={uploading}
        progress={uploadProgress}
        error={uploadError}
      />

      {steps.length > 0 ? (
        <DubTimingsEditor
          steps={steps}
          dubTimings={d.dub?.dubTimings ?? []}
          onUpdate={d.setDubTiming}
        />
      ) : (
        <p className="text-xs text-gray-400">
          Build steps first (split / merge / auto-slice above) so each step can be marked inside the
          dub track.
        </p>
      )}

      <DubActionRow d={d} />
      {d.dubAligned ? <DubPreviewToggle d={d} /> : null}
    </div>
  );
};

interface DubTrackUploadProps {
  dub: Dubbing["dub"];
  uploading: boolean;
  progress: number;
  error: string | null;
  onUpload: (file: File) => void;
  onClear: () => void;
}

function DubTrackUpload({
  dub,
  uploading,
  progress,
  error,
  onUpload,
  onClear,
}: DubTrackUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pick = () => inputRef.current?.click();
  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) {
      onUpload(file);
    }
  };

  if (dub) {
    return (
      <div className="rounded-lg border border-[#ede7fa] bg-[#F6F3FF] px-3 py-2">
        <div className="flex items-center gap-2">
          <Music size={14} className="shrink-0 text-[#A594F9]" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#7C5CFC]">
            {dub.duration > 0 ? `Dub track (${dub.duration.toFixed(1)}s)` : "Dub track"}
          </span>
          <button
            type="button"
            onClick={pick}
            className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-[#7C5CFC] hover:bg-[#EDE7FA] transition"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 transition"
          >
            Remove
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
        onClick={pick}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center transition ${
          uploading
            ? "border-[#A594F9] bg-[#F6F3FF]"
            : "border-[#E5DFF7] bg-white hover:border-[#A594F9]"
        }`}
      >
        <Upload size={20} className="text-[#A594F9]" />
        <p className="text-sm font-medium text-[#7C5CFC]">
          {uploading ? "Uploading dub track…" : "Drop your dub audio here"}
        </p>
        <p className="text-xs text-gray-400">or click to browse — MP3, WAV, M4A or OGG</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {uploading ? (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#E5DFF7]">
            <div
              className="h-full rounded-full bg-[#8A76FC] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="shrink-0 text-[11px] text-gray-500">{progress}%</span>
        </div>
      ) : null}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

interface DubTimingsEditorProps {
  steps: { id: string; index: number; startTime: number; endTime: number; label?: string }[];
  dubTimings: { stepId: string; start: number; end: number }[];
  onUpdate: (stepId: string, start: number, end: number) => void;
}

function DubTimingsEditor({ steps, dubTimings, onUpdate }: DubTimingsEditorProps) {
  const timingFor = (stepId: string) => dubTimings.find((t) => t.stepId === stepId);
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-[#6B6B6B] dark:text-inherit">
        Step timing in the dub track (seconds)
      </h3>
      <ul className="space-y-2">
        {steps.map((step) => (
          <DubTimingRow key={step.id} step={step} timing={timingFor(step.id)} onUpdate={onUpdate} />
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-gray-400">
        Leave blank to skip alignment — the original source is returned as-is.
      </p>
    </div>
  );
}

interface DubTimingRowProps {
  step: { id: string; index: number; startTime: number; endTime: number; label?: string };
  timing?: { stepId: string; start: number; end: number };
  onUpdate: (stepId: string, start: number, end: number) => void;
}

function DubTimingRow({ step, timing, onUpdate }: DubTimingRowProps) {
  const update = (field: "start" | "end", raw: string) => {
    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value) || value < 0) {
      return;
    }
    const start = field === "start" ? value : (timing?.start ?? value);
    const end = field === "end" ? value : (timing?.end ?? value);
    if (end > start) {
      onUpdate(step.id, start, end);
    }
  };
  const inputClass =
    "w-[74px] rounded-md border border-[#E5DFF7] px-2 py-1 text-xs text-[#3A3A3A] dark:text-inherit dark:bg-transparent";
  return (
    <li className="flex items-center gap-2">
      <span className="w-14 shrink-0 truncate text-[11px] text-[#6B6B6B] dark:text-inherit">
        {step.label ?? `Step ${step.index + 1}`}
      </span>
      <span className="flex items-center gap-1 text-[11px] text-gray-400">
        start
        <input
          type="number"
          min={0}
          step="0.1"
          value={timing?.start ?? ""}
          placeholder={step.startTime.toFixed(1)}
          onChange={(e) => update("start", e.target.value)}
          className={inputClass}
        />
      </span>
      <span className="flex items-center gap-1 text-[11px] text-gray-400">
        end
        <input
          type="number"
          min={0}
          step="0.1"
          value={timing?.end ?? ""}
          placeholder={step.endTime.toFixed(1)}
          onChange={(e) => update("end", e.target.value)}
          className={inputClass}
        />
      </span>
    </li>
  );
}

function DubActionRow({ d }: { d: Dubbing }) {
  const label = d.running
    ? `${STATE_LABEL[d.jobState ?? "pending"]}${d.progress !== null ? ` · ${d.progress}%` : ""}`
    : d.previewDubSource
      ? "Re-dub with the original source"
      : "Generate Dubbed Demo";
  return (
    <div>
      <button
        type="button"
        onClick={d.run}
        disabled={!d.canRun || d.running}
        className={`${btnBase} w-full bg-[#8A76FC] text-white hover:bg-[#7A66EC]`}
      >
        {d.running ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" />
            {label}
          </span>
        ) : (
          label
        )}
      </button>
      {!d.canRun && d.blockedReason ? (
        <p className="mt-1 text-[11px] text-gray-400">{d.blockedReason}</p>
      ) : null}
      {d.error && !d.running ? <p className="mt-1 text-xs text-red-600">{d.error}</p> : null}
    </div>
  );
}

function DubPreviewToggle({ d }: { d: Dubbing }) {
  return (
    <div className="rounded-lg border border-[#A9F9B9] bg-[#F0FFF4] px-3 py-2">
      <p className="mb-2 text-xs font-semibold text-emerald-700">
        Dubbed source ready ({d.dubAligned?.duration.toFixed(1)}s)
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => d.setPreviewDubSource(true)}
          disabled={d.previewDubSource}
          className={`${btnBase} ${d.previewDubSource ? "bg-[#8A76FC] text-white" : "border border-[#A594F9] text-[#7C5CFC] hover:bg-[#F6F3FF]"}`}
        >
          Preview dubbed
        </button>
        <button
          type="button"
          onClick={() => d.setPreviewDubSource(false)}
          disabled={!d.previewDubSource}
          className={`${btnBase} ${d.previewDubSource ? "border border-[#A594F9] text-[#7C5CFC] hover:bg-[#F6F3FF]" : "bg-[#8A76FC] text-white"}`}
        >
          Preview original
        </button>
      </div>
    </div>
  );
}

export default DubbingPanel;
