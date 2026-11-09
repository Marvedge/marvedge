import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import {
  AUTO_DETECT_LANGUAGE,
  cuesToVtt,
  isSubtitleEditorEnabled,
  normalizeCues,
  normalizeLanguage,
  readCueList,
} from "@/app/lib/subtitles";
import ShareVideoPageClient from "./ShareVideoPageClient";
import { BRANCH_PLACEMENTS } from "@/app/lib/overlays/branch";
import { shareAspectRatio, shareBackgroundStyle } from "@/app/lib/demos/sharePresentation";
import { resolveShareOverlays, shareMediaUrl } from "./overlayContext";

type PageProps = {
  params: Promise<{ slug: string }>;
};

/**
 * SUB PR 6: soft captions for the share page, as a WebVTT document.
 *
 * ONLY WHEN THE PAGE IS SERVING THE UN-EXPORTED SOURCE. Two reasons, and both
 * are hard blocks rather than preferences:
 *
 *   1. An exported MP4 already has the subtitles drawn into the picture (unless
 *      the user turned burn-in off, which nothing on the demo records), so a
 *      soft track would double them up on screen.
 *   2. `editing.subtitles` is timed against the ORIGINAL recording. The export
 *      re-times every cue across the trim segments — that is what
 *      remapSubtitleCuesToTrimmedTimeline() in the worker does — so those cue
 *      times do not describe the exported file at all. The raw source is the one
 *      video they are correct for.
 *
 * Returns null when there is nothing to attach, when the demo has been exported,
 * or when NEXT_PUBLIC_SUBTITLE_EDITOR_ENABLED is off — so a share page without
 * the feature renders exactly as it does today.
 */
function captionsForSource(demo: {
  exportedUrl: string | null;
  subtitles: unknown;
  editing: unknown;
}): { vtt: string; language: string } | null {
  if (!isSubtitleEditorEnabled() || demo.exportedUrl) {
    return null;
  }

  const editing =
    demo.editing && typeof demo.editing === "object"
      ? (demo.editing as Record<string, unknown>)
      : {};

  // The editor's working copy first — it carries the user's corrections;
  // `Demo.subtitles` is what generation wrote and only matters for a demo that
  // was never opened in the panel afterwards.
  const raw = readCueList(editing.subtitles);
  const cues = normalizeCues(raw.length > 0 ? raw : readCueList(demo.subtitles));
  if (cues.length === 0) {
    return null;
  }

  return {
    vtt: cuesToVtt(cues),
    language: normalizeLanguage(
      typeof editing.subtitleLanguage === "string" ? editing.subtitleLanguage : AUTO_DETECT_LANGUAGE
    ),
  };
}

export default async function SharePage({ params }: PageProps) {
  const { slug } = await params;
  const demo = await prisma.demo.findFirst({
    where: {
      isPublic: true,
      OR: [{ publicLink: slug }, { id: slug }],
    },
    select: {
      id: true,
      title: true,
      description: true,
      videoUrl: true,
      exportedUrl: true,
      editing: true,
      subtitles: true,
      ctas: {
        // Branch cards are Cta rows too (decision 6), and they are rendered by
        // the player's overlay — not as a button under the video. Excluding
        // them by placement is what stops a demo with branching configured
        // growing two extra buttons down here. `placement` is null on every CTA
        // that exists today, so the rendered output is unchanged for all of them
        // — and the OR is spelled out because SQL's `NOT IN` is NULL, not true,
        // for a null column.
        where: { OR: [{ placement: null }, { placement: { notIn: [...BRANCH_PLACEMENTS] } }] },
        select: { id: true, label: true, url: true, order: true },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!demo) {
    notFound();
  }

  // undefined — and no extra query — whenever OVERLAYS_ENABLED is off.
  const overlayContext = await resolveShareOverlays(demo.id);

  const captions = captionsForSource(demo);

  return (
    <ShareVideoPageClient
      title={demo.title}
      description={demo.description}
      videoUrl={shareMediaUrl(demo.exportedUrl || demo.videoUrl, overlayContext)}
      backgroundStyle={shareBackgroundStyle(demo.editing, {
        background:
          "radial-gradient(circle at 20% 20%, rgba(250,194,209,0.5), transparent 40%), radial-gradient(circle at 80% 10%, rgba(173,188,255,0.55), transparent 38%), linear-gradient(135deg,#7E6ADB 0%, #4F64C9 50%, #1E2D67 100%)",
      })}
      aspectRatio={shareAspectRatio(demo.editing)}
      demoId={demo.id}
      ctas={demo.ctas}
      overlays={overlayContext?.overlays}
      ownerName={overlayContext?.ownerName}
      leadCaptured={overlayContext?.leadCaptured}
      mediaGated={overlayContext?.mediaGated}
      branchCards={overlayContext?.branchCards}
      captionsVtt={captions?.vtt}
      captionsLanguage={captions?.language}
    />
  );
}
