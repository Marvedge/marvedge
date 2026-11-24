"use client";

import React, { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

import { useAudioClipStore } from "@/app/store/audioClipStore";
import { useEditorStore } from "@/app/store/editor/editorStore";
import { clipWindow, playableUrl } from "./previewTiming";

/** The URL to play for a clip: the trimmed version when present, else the original. */

/**
 * Renders one hidden <audio> element per READY clip and keeps each element in
 * sync with the editor video player: clips are only audible while the video
 * playhead is inside their timeline window.
 */
export default function AudioPreviewLayer({ playbackSpeed }: { playbackSpeed: number }) {
  const savedDemoId = useEditorStore((s) => s.savedDemoId);
  const clips = useAudioClipStore((s) => s.clips);
  const placements = useAudioClipStore((s) => s.placements);
  const fetchClips = useAudioClipStore((s) => s.fetchClips);

  const { playing, currentTime, volume } = useEditorStore(
    useShallow((s) => ({
      playing: s.playing,
      currentTime: s.currentTime,
      volume: s.volume,
    }))
  );

  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  // Last video time we synced from — avoids feedback loops when we set audio time.
  const lastSyncedTimeRef = useRef(-1);

  useEffect(() => {
    if (savedDemoId) {
      void fetchClips(savedDemoId);
    }
  }, [savedDemoId, fetchClips]);

  const readyClips = clips.filter((c) => c.status === "READY" && playableUrl(c));

  // Sync rate + volume for every element (window gating happens below).
  useEffect(() => {
    for (const el of audioRefs.current.values()) {
      el.playbackRate = playbackSpeed;
      el.volume = volume;
    }
  }, [playbackSpeed, volume, readyClips]);

  // Window gating: pause everything that is outside its clip's window or not
  // playing; start elements as soon as the playhead enters their window. An
  // element that reached the end of its source file pauses itself, so this
  // also restarts it at the loop point on the following tick.
  useEffect(() => {
    for (const [clipId, el] of audioRefs.current.entries()) {
      const clip = readyClips.find((c) => c.id === clipId);
      if (!clip) {
        continue;
      }
      const window = clipWindow(clip, placements);
      const inside = playing && currentTime >= window.start - 0.01 && currentTime < window.end;
      if (!inside) {
        if (!el.paused) {
          el.pause();
        }
        continue;
      }
      if (el.paused) {
        try {
          el.currentTime = window.sourcePosFor(currentTime);
        } catch {
          // Seeking before metadata loads throws — safe to ignore.
        }
        void el.play().catch(() => {
          // Autoplay can reject before user interaction — ignore.
        });
      }
    }
  }, [playing, currentTime, readyClips, placements]);

  // Sync seek: when the video time jumps (scrub/trim), reposition the audio
  // heads so they line up with the new playhead position inside the window.
  useEffect(() => {
    if (Math.abs(currentTime - lastSyncedTimeRef.current) < 0.25) {
      return;
    }
    lastSyncedTimeRef.current = currentTime;
    for (const [clipId, el] of audioRefs.current.entries()) {
      const clip = readyClips.find((c) => c.id === clipId);
      if (!clip) {
        continue;
      }
      const window = clipWindow(clip, placements);
      if (currentTime < window.start || currentTime > window.end) {
        el.pause();
        continue;
      }
      try {
        el.currentTime = window.sourcePosFor(currentTime);
      } catch {
        // Seeking before metadata loads throws — safe to ignore.
      }
      if (!playing && !el.paused) {
        el.pause();
      }
    }
  }, [currentTime, readyClips, playing, placements]);

  if (readyClips.length === 0) {
    return null;
  }

  return (
    <div className="hidden" aria-hidden="true">
      {readyClips.map((clip) => (
        <audio
          key={clip.id}
          ref={(el) => {
            if (el) {
              audioRefs.current.set(clip.id, el);
            } else {
              audioRefs.current.delete(clip.id);
            }
          }}
          src={playableUrl(clip) ?? undefined}
          preload="auto"
        />
      ))}
    </div>
  );
}
