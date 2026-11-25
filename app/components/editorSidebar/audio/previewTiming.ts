import { getSourceLengthSec } from "@/app/store/audioClipStore";
import type { AudioClipDto } from "@/app/types/audio";

export function playableUrl(clip: AudioClipDto): string | null {
  return clip.trimmedUrl || clip.originalUrl || null;
}

/** Maps video timeline time to a position in the selected audio file. */
export function clipWindow(
  clip: AudioClipDto,
  placements: Record<string, { start: number; len: number }>
) {
  const srcLen = getSourceLengthSec(clip);
  const placement = placements[clip.id] ?? { start: clip.trimStartSec, len: srcLen };
  // A trimmed asset already starts at the selected trim point.
  const sourceStart = clip.trimmedUrl ? 0 : clip.trimStartSec;

  const end = placement.start + placement.len;

  return {
    contains: (videoTime: number) => videoTime >= placement.start && videoTime < end,
    sourcePosFor: (videoTime: number) =>
      sourceStart + (Math.max(0, videoTime - placement.start) % srcLen),
  };
}
