    const jobData = job.jobData as unknown;
    let subtitles: unknown = null;
    // AVS time-alignment (kind: "AVS_SYNC" and the dub variant "AVS_DUB")
    // surfaces its aligned source here so the client can poll for it; additive
    // and inert for every other job kind.
    let aligned: { alignedVideoUrl: unknown; duration: unknown } | null = null;
    // Reframe saliency trajectory (kind: "REFRAME") surfaces cropTargets here.
    let cropTargets: unknown = null;
    if (jobData && typeof jobData === "object") {
      const rec = jobData as Record<string, unknown>;
      if (rec.kind === "SUBTITLES") {
        subtitles = rec.subtitles ?? null;
      } else if (rec.kind === "AVS_SYNC" || rec.kind === "AVS_DUB") {
        aligned = {
          alignedVideoUrl: rec.alignedVideoUrl ?? null,
          duration: rec.duration ?? null,
        };
      } else if (rec.kind === "AVS_DUB") {
        // AVS_DUB surfaces the same aligned shape as AVS_SYNC.
        aligned = {
          alignedVideoUrl: rec.alignedVideoUrl ?? null,
          duration: rec.duration ?? null,
        };
      } else if (rec.kind === "REFRAME") {
        cropTargets = rec.cropTargets ?? null;
      }
    }