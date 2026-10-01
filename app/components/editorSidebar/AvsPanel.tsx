import React from "react";

import StepTimeline from "./avs/StepTimeline";
import ScriptEditor from "./avs/ScriptEditor";
import VoiceoverEditor from "./avs/VoiceoverEditor";
import CaptionsEditor from "./avs/CaptionsEditor";
import AvsPipeline from "./avs/AvsPipeline";
import DubbingPanel from "./avs/DubbingPanel";
import { useStepEditing } from "./avs/useStepEditing";
import { useScriptEditing } from "./avs/useScriptEditing";
import { useVoiceoverGeneration } from "./avs/useVoiceoverGeneration";
import { useCaptions } from "./avs/useCaptions";
import { useAvsPipeline } from "./avs/useAvsPipeline";

/**
 * AVS ("AI Voice & Script") sidebar panel.
 *
 * PR 2 fills the scaffold with step editing: the demo auto-slices into steps
 * from click-capture timestamps (reusing the auto-zoom ingestion, #216), shown
 * on a timeline where the user can split at the playhead, merge adjacent steps,
 * and drag boundaries. Steps persist to `Demo.editing.avs.steps` via the
 * existing autosave (it already serializes the store's `avs` field).
 *
 * PR 3 adds the AI script (AVS-2.1): per-step narration seeded from the Deepgram
 * transcript, editable, and rewritable into a tone via OpenAI. It persists to
 * `Demo.editing.avs.script`.
 *
 * PR 4 adds the voiceover (AVS-2.2): a Deepgram Aura voice picker, an optional
 * pronunciation dictionary, and a "Generate Voiceover" action that calls the
 * Cloud Run worker to produce ONE continuous MP3 (with per-step timings). It
 * persists to `Demo.editing.avs.voiceover`.
 *
 * PR 5 adds captions (AVS-2.3): a "Generate Captions" action transcribes the
 * voiceover audio (via the existing subtitle route) and stabilizes the cues so
 * they stop flickering, plus a `.vtt` export. It persists to
 * `Demo.editing.avs.captions` and never touches the non-AVS subtitle flow.
 *
 * PR 7 adds the end-to-end orchestration: a single "Generate AI Voiceover Demo"
 * action (AvsPipeline) that runs every stage in sequence — steps → script →
 * voiceover → subtitles → time-alignment → export — and feeds the aligned source
 * plus stabilized captions into the existing export route. The stage editors
 * below stay available for fine-tuning any individual step.
 *
 * The whole panel is gated behind NEXT_PUBLIC_AVS_ENABLED by its parents
 * (EditorSidebar / SidebarHeader), so nothing here runs when the flag is off.
 */
const AvsPanel: React.FC = () => {
  const {
    steps,
    duration,
    currentTime,
    selectedStepId,
    setSelectedStepId,
    clickTimes,
    splittable,
    canMerge,
    handleSplit,
    handleMerge,
    handleAutoSlice,
    handleAdjustBoundary,
  } = useStepEditing();

  const script = useScriptEditing();
  const voiceover = useVoiceoverGeneration();
  const captions = useCaptions();
  const pipeline = useAvsPipeline();

  const btnBase =
    "flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="control-block-label text-lg font-bold text-[#A594F9] mb-1">
          AI Voice &amp; Script
        </h2>
        <p className="text-xs text-[#6B6B6B] dark:text-inherit mb-4">
          Break the demo into steps. Each step becomes a unit for the AI script and synced
          voiceover.
        </p>

        <div className="mb-6">
          <AvsPipeline
            stages={pipeline.stages}
            running={pipeline.running}
            canRun={pipeline.canRun}
            blockedReason={pipeline.blockedReason}
            exportedUrl={pipeline.exportedUrl}
            onRun={pipeline.run}
          />
        </div>

        <StepTimeline
          steps={steps}
          duration={duration}
          currentTime={currentTime}
          selectedStepId={selectedStepId}
          onSelectStep={setSelectedStepId}
          onAdjustBoundary={handleAdjustBoundary}
        />

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handleSplit}
            disabled={!splittable}
            className={`${btnBase} bg-[#8A76FC] text-white hover:bg-[#7A66EC]`}
          >
            Split at playhead
          </button>
          <button
            type="button"
            onClick={handleMerge}
            disabled={!canMerge}
            className={`${btnBase} border border-[#A594F9] text-[#7C5CFC] hover:bg-[#F6F3FF]`}
          >
            Merge selected
          </button>
        </div>

        <button
          type="button"
          onClick={handleAutoSlice}
          disabled={clickTimes.length === 0}
          className={`${btnBase} mt-2 w-full border border-[#A594F9] text-[#7C5CFC] hover:bg-[#F6F3FF]`}
        >
          {clickTimes.length > 0
            ? `Auto-slice from ${clickTimes.length} click${clickTimes.length === 1 ? "" : "s"}`
            : "No clicks captured"}
        </button>

        <p className="mt-3 text-[11px] text-[#6B6B6B] dark:text-inherit">
          {steps.length} step{steps.length === 1 ? "" : "s"}
          {" · select a step to merge, or drag a boundary to adjust."}
        </p>
      </div>

      <div className="border-t border-[#ede7fa] pt-6">
        <ScriptEditor {...script} />
      </div>

      <div className="border-t border-[#ede7fa] pt-6">
        <VoiceoverEditor {...voiceover} />
      </div>

      <div className="border-t border-[#ede7fa] pt-6">
        <CaptionsEditor {...captions} />
      </div>

      <DubbingPanel />
    </div>
  );
};

export default AvsPanel;
