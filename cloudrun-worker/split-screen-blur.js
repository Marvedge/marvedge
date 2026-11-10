"use strict";

const fs = require("node:fs");

const CANONICAL_SCHEMA = "marvedge.speaker-tracks";
const CANONICAL_SCHEMA_VERSION = 1;

function validateConfig({ width, height, blurStrength = 20 }) {
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error("Width must be a positive integer.");
  }

  if (!Number.isInteger(height) || height <= 0) {
    throw new Error("Height must be a positive integer.");
  }

  if (!Number.isFinite(blurStrength) || blurStrength < 0) {
    throw new Error("Blur strength must be a finite, non-negative number.");
  }
}

function buildSplitScreenBlurFilter(config) {
  validateConfig(config);

  const { width, height, blurStrength = 20 } = config;

  return [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    `gblur=sigma=${blurStrength}`,
    "setsar=1",
    "format=yuv420p",
  ].join(",");
}

/**
 * Determines whether two speakers are far enough apart horizontally
 * to trigger split-screen mode.
 *
 * Split-screen is triggered when:
 * horizontal distance > 35% of source frame width.
 */
function getSplitScreenDecision(
  speaker1,
  speaker2,
  frameWidth,
  config = { distanceThresholdRatio: 0.35 }
) {
  if (
    !Number.isFinite(frameWidth) ||
    frameWidth <= 0 ||
    !speaker1 ||
    !Number.isFinite(speaker1.x) ||
    !speaker2 ||
    !Number.isFinite(speaker2.x)
  ) {
    return {
      splitScreen: false,
      horizontalDistance: 0,
      threshold: 0,
    };
  }

  const horizontalDistance = Math.abs(speaker1.x - speaker2.x);
  const ratio =
    config && Number.isFinite(config.distanceThresholdRatio)
      ? config.distanceThresholdRatio
      : 0.35;
  const threshold = ratio * frameWidth;

  return {
    splitScreen: horizontalDistance > threshold,
    horizontalDistance,
    threshold,
  };
}

/**
 * Builds the complete dual-speaker split-screen filtergraph.
 * Uses both speakers' coordinates to crop two distinct panels,
 * scaling and overlaying them over the blurred background.
 */
function buildSplitScreenFilterGraph({
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
  speaker1,
  speaker2,
  blurStrength = 20,
}) {
  const sW = Number(sourceWidth) || 1280;
  const sH = Number(sourceHeight) || 720;
  const tW = Number(targetWidth) || 1280;
  const tH = Number(targetHeight) || 720;

  // Order speakers from left to right
  const [leftSpk, rightSpk] =
    speaker1 && speaker2 && speaker1.x <= speaker2.x
      ? [speaker1, speaker2]
      : [speaker2 || { x: 0 }, speaker1 || { x: 0 }];

  const blurFilter = buildSplitScreenBlurFilter({
    width: tW,
    height: tH,
    blurStrength,
  });

  const isVertical = tH > tW;

  let panelW, panelH, overlay1, overlay2;
  if (isVertical) {
    // Top-and-bottom stacked panels for vertical 9:16 video
    panelW = tW - (tW % 2);
    panelH = Math.floor(tH / 2);
    panelH = panelH - (panelH % 2);
    overlay1 = { x: 0, y: 0 };
    overlay2 = { x: 0, y: panelH };
  } else {
    // Side-by-side panels for horizontal 16:9 / 1:1 video
    panelW = Math.floor(tW / 2);
    panelW = panelW - (panelW % 2);
    panelH = tH - (tH % 2);
    overlay1 = { x: 0, y: 0 };
    overlay2 = { x: panelW, y: 0 };
  }

  // Calculate crop window in source video matching panel aspect ratio
  const panelAspect = panelW / Math.max(1, panelH);
  let cropH = sH;
  let cropW = Math.round(cropH * panelAspect);
  if (cropW > sW) {
    cropW = sW;
    cropH = Math.round(cropW / panelAspect);
  }
  cropW = Math.max(2, cropW - (cropW % 2));
  cropH = Math.max(2, cropH - (cropH % 2));

  // Center crop around each speaker's x coordinate
  const spk1_x = Math.max(0, Math.min(sW - cropW, Math.round(leftSpk.x - cropW / 2)));
  const spk1_y = Math.max(0, Math.min(sH - cropH, Math.round((sH - cropH) / 2)));
  const spk2_x = Math.max(0, Math.min(sW - cropW, Math.round(rightSpk.x - cropW / 2)));
  const spk2_y = Math.max(0, Math.min(sH - cropH, Math.round((sH - cropH) / 2)));

  const crop1 = { x: spk1_x, y: spk1_y, width: cropW, height: cropH };
  const crop2 = { x: spk2_x, y: spk2_y, width: cropW, height: cropH };

  const filter = [
    `[fpsnorm]split=3[split_bg_in][spk1_in][spk2_in];`,
    `[split_bg_in]${blurFilter}[split_bg];`,
    `[spk1_in]crop=${cropW}:${cropH}:${spk1_x}:${spk1_y},scale=${panelW}:${panelH}:flags=lanczos,setsar=1[spk1];`,
    `[spk2_in]crop=${cropW}:${cropH}:${spk2_x}:${spk2_y},scale=${panelW}:${panelH}:flags=lanczos,setsar=1[spk2];`,
    `[split_bg][spk1]overlay=${overlay1.x}:${overlay1.y}[bg_spk1];`,
    `[bg_spk1][spk2]overlay=${overlay2.x}:${overlay2.y}:format=auto[split_res]`,
  ].join("");

  return {
    filter,
    panelWidth: panelW,
    panelHeight: panelH,
    crop1,
    crop2,
    overlay1,
    overlay2,
  };
}

/**
 * Extracts speaker coordinates and frame dimensions from Task-00016 / TalkNet speaker tracks JSON.
 */
function parseSpeakerTracks(rawContent, defaultFrameWidth) {
  if (!rawContent) {
    return { speakers: [], frameWidth: defaultFrameWidth };
  }

  let data = rawContent;
  if (typeof rawContent === "string") {
    const trimmed = rawContent.trim();
    if (!trimmed) {
      return { speakers: [], frameWidth: defaultFrameWidth };
    }
    try {
      data = JSON.parse(trimmed);
    } catch {
      return { speakers: [], frameWidth: defaultFrameWidth };
    }
  }

  if (!data || typeof data !== "object") {
    return { speakers: [], frameWidth: defaultFrameWidth };
  }

  // Canonical schema validation (Task-00107)
  if (!Array.isArray(data) && "schema" in data) {
    if (data.schema !== CANONICAL_SCHEMA) {
      console.warn(
        `[split-screen] Warning: Unsupported schema "${data.schema}"; falling back to normal single-speaker crop.`
      );
      return {
        speakers: [],
        frameWidth: defaultFrameWidth,
        valid: false,
        reason: "unsupported_schema",
        error: `Unsupported schema "${data.schema}"`,
      };
    }

    if (data.schema_version !== CANONICAL_SCHEMA_VERSION) {
      console.warn(
        `[split-screen] Warning: Unsupported schema version "${data.schema_version}"; falling back to normal single-speaker crop.`
      );
      return {
        speakers: [],
        frameWidth: defaultFrameWidth,
        valid: false,
        reason: "unsupported_schema_version",
        error: `Unsupported schema version "${data.schema_version}"`,
      };
    }

    const source = data.source;
    if (
      !source ||
      typeof source !== "object" ||
      Array.isArray(source) ||
      !Number.isFinite(source.width) ||
      source.width <= 0 ||
      !Number.isFinite(source.height) ||
      source.height <= 0 ||
      !Number.isFinite(source.fps) ||
      source.fps <= 0 ||
      !Number.isFinite(source.duration_sec) ||
      source.duration_sec < 0
    ) {
      console.warn(
        "[split-screen] Warning: Invalid canonical source metadata; falling back to normal single-speaker crop."
      );
      return {
        speakers: [],
        frameWidth: defaultFrameWidth,
        valid: false,
        reason: "invalid_schema",
        error: "Invalid canonical source metadata",
      };
    }

    if (!Array.isArray(data.speakers)) {
      console.warn(
        "[split-screen] Warning: Canonical 'speakers' must be an array; falling back to normal single-speaker crop."
      );
      return {
        speakers: [],
        frameWidth: source.width,
        valid: false,
        reason: "invalid_schema",
        error: "Canonical 'speakers' must be an array",
      };
    }

    if (data.speakers.length === 0) {
      return {
        speakers: [],
        frameWidth: source.width,
        valid: true,
      };
    }

    const canonicalSpeakers = [];
    for (let i = 0; i < data.speakers.length; i++) {
      const s = data.speakers[i];
      if (!s || typeof s !== "object" || Array.isArray(s)) {
        console.warn(
          `[split-screen] Warning: Canonical speaker at index ${i} is not an object; falling back to normal single-speaker crop.`
        );
        return {
          speakers: [],
          frameWidth: source.width,
          valid: false,
          reason: "invalid_schema",
          error: `Canonical speaker at index ${i} is not an object`,
        };
      }

      if (
        s.track_id === undefined ||
        s.track_id === null ||
        (typeof s.track_id !== "string" && typeof s.track_id !== "number") ||
        String(s.track_id).trim() === ""
      ) {
        console.warn(
          `[split-screen] Warning: Canonical speaker at index ${i} is missing valid track_id; falling back to normal single-speaker crop.`
        );
        return {
          speakers: [],
          frameWidth: source.width,
          valid: false,
          reason: "invalid_schema",
          error: `Canonical speaker at index ${i} is missing valid track_id`,
        };
      }

      if (typeof s.average_confidence !== "number" || !Number.isFinite(s.average_confidence)) {
        console.warn(
          `[split-screen] Warning: Canonical speaker "${s.track_id}" has invalid average_confidence; falling back to normal single-speaker crop.`
        );
        return {
          speakers: [],
          frameWidth: source.width,
          valid: false,
          reason: "invalid_schema",
          error: `Canonical speaker "${s.track_id}" has invalid average_confidence`,
        };
      }

      if (!Array.isArray(s.frames)) {
        console.warn(
          `[split-screen] Warning: Canonical speaker "${s.track_id}" frames must be an array; falling back to normal single-speaker crop.`
        );
        return {
          speakers: [],
          frameWidth: source.width,
          valid: false,
          reason: "invalid_schema",
          error: `Canonical speaker "${s.track_id}" frames must be an array`,
        };
      }

      for (let j = 0; j < s.frames.length; j++) {
        const f = s.frames[j];
        if (!f || typeof f !== "object" || Array.isArray(f)) {
          console.warn(
            `[split-screen] Warning: Canonical frame at index ${j} for speaker "${s.track_id}" is not an object; falling back to normal single-speaker crop.`
          );
          return {
            speakers: [],
            frameWidth: source.width,
            valid: false,
            reason: "invalid_schema",
            error: `Canonical frame at index ${j} for speaker "${s.track_id}" is not an object`,
          };
        }

        if (!Number.isInteger(f.frame) || f.frame < 0) {
          console.warn(
            `[split-screen] Warning: Canonical frame at index ${j} for speaker "${s.track_id}" has invalid frame index; falling back to normal single-speaker crop.`
          );
          return {
            speakers: [],
            frameWidth: source.width,
            valid: false,
            reason: "invalid_schema",
            error: `Canonical frame at index ${j} for speaker "${s.track_id}" has invalid frame index`,
          };
        }

        const ts = f.timestamp_sec !== undefined ? f.timestamp_sec : f.timestamp;
        if (typeof ts !== "number" || !Number.isFinite(ts) || ts < 0) {
          console.warn(
            `[split-screen] Warning: Canonical frame at index ${j} for speaker "${s.track_id}" has invalid timestamp; falling back to normal single-speaker crop.`
          );
          return {
            speakers: [],
            frameWidth: source.width,
            valid: false,
            reason: "invalid_schema",
            error: `Canonical frame at index ${j} for speaker "${s.track_id}" has invalid timestamp`,
          };
        }

        if (
          !Array.isArray(f.bbox) ||
          f.bbox.length !== 4 ||
          !f.bbox.every((coord) => typeof coord === "number" && Number.isFinite(coord)) ||
          f.bbox[2] <= f.bbox[0] ||
          f.bbox[3] <= f.bbox[1]
        ) {
          console.warn(
            `[split-screen] Warning: Canonical frame at index ${j} for speaker "${s.track_id}" has invalid bounding box; falling back to normal single-speaker crop.`
          );
          return {
            speakers: [],
            frameWidth: source.width,
            valid: false,
            reason: "invalid_schema",
            error: `Canonical frame at index ${j} for speaker "${s.track_id}" has invalid bounding box`,
          };
        }

        if (typeof f.speaking_score !== "number" || !Number.isFinite(f.speaking_score)) {
          console.warn(
            `[split-screen] Warning: Canonical frame at index ${j} for speaker "${s.track_id}" has invalid speaking_score; falling back to normal single-speaker crop.`
          );
          return {
            speakers: [],
            frameWidth: source.width,
            valid: false,
            reason: "invalid_schema",
            error: `Canonical frame at index ${j} for speaker "${s.track_id}" has invalid speaking_score`,
          };
        }

        if (typeof f.is_speaking !== "boolean") {
          console.warn(
            `[split-screen] Warning: Canonical frame at index ${j} for speaker "${s.track_id}" has non-boolean is_speaking; falling back to normal single-speaker crop.`
          );
          return {
            speakers: [],
            frameWidth: source.width,
            valid: false,
            reason: "invalid_schema",
            error: `Canonical frame at index ${j} for speaker "${s.track_id}" has non-boolean is_speaking`,
          };
        }
      }

      // Compute horizontal coordinate x from frames
      const activeFrames = s.frames.filter((f) => f.is_speaking);
      const framesToUse = activeFrames.length > 0 ? activeFrames : s.frames;
      let sumX = 0;
      let count = 0;
      for (const f of framesToUse) {
        if (Array.isArray(f.bbox) && f.bbox.length === 4) {
          sumX += (f.bbox[0] + f.bbox[2]) / 2;
          count++;
        }
      }

      let x = count > 0 ? sumX / count : undefined;
      if (x === undefined && typeof s.x === "number" && Number.isFinite(s.x)) {
        x = s.x;
      }

      if (typeof x !== "number" || !Number.isFinite(x)) {
        console.warn(
          `[split-screen] Warning: Canonical speaker "${s.track_id}" has no valid horizontal coordinates; falling back to normal single-speaker crop.`
        );
        return {
          speakers: [],
          frameWidth: source.width,
          valid: false,
          reason: "invalid_schema",
          error: `Canonical speaker "${s.track_id}" has no valid horizontal coordinates`,
        };
      }

      canonicalSpeakers.push({
        id: String(s.track_id),
        track_id: String(s.track_id),
        x,
        average_confidence: s.average_confidence,
        frames: s.frames,
      });
    }

    return {
      speakers: canonicalSpeakers,
      frameWidth: source.width,
      valid: true,
    };
  }

  // Determine frame width from Task-00016 source envelope or metadata
  const frameWidth =
    Number(data?.source?.width) ||
    Number(data?.metadata?.width) ||
    Number(data?.frameWidth) ||
    Number(data?.width) ||
    defaultFrameWidth;

  let rawSpeakers = [];
  if (Array.isArray(data)) {
    rawSpeakers = data;
  } else if (Array.isArray(data.speakers)) {
    rawSpeakers = data.speakers;
  } else if (data.speaker1 && data.speaker2) {
    rawSpeakers = [data.speaker1, data.speaker2];
  } else if (Array.isArray(data.crop_targets)) {
    // Task-00016 crop-targets
    const speakerTargets = data.crop_targets.filter(
      (t) => t && (t.source === "speaker" || t.crop)
    );
    rawSpeakers = speakerTargets;
  }

  const speakers = [];
  for (const s of rawSpeakers) {
    if (!s || typeof s !== "object") continue;

    let x = undefined;
    if (typeof s.x === "number" && Number.isFinite(s.x)) {
      x = s.x;
    } else if (Array.isArray(s.bbox) && s.bbox.length === 4) {
      // bbox is [x1, y1, x2, y2]
      x = (s.bbox[0] + s.bbox[2]) / 2;
    } else if (s.crop && typeof s.crop.x === "number" && Number.isFinite(s.crop.x)) {
      x = s.crop.x + (Number(s.crop.width) || 0) / 2;
    } else if (Array.isArray(s.frames)) {
      // TalkNet per-frame detections: average speaking face bboxes
      const activeFrames = s.frames.filter(
        (f) => f && f.is_speaking !== false && (Array.isArray(f.bbox) || typeof f.x === "number")
      );
      const framesToUse = activeFrames.length > 0 ? activeFrames : s.frames;
      let sumX = 0;
      let count = 0;
      for (const f of framesToUse) {
        if (typeof f.x === "number" && Number.isFinite(f.x)) {
          sumX += f.x;
          count++;
        } else if (Array.isArray(f.bbox) && f.bbox.length === 4) {
          sumX += (f.bbox[0] + f.bbox[2]) / 2;
          count++;
        }
      }
      if (count > 0) {
        x = sumX / count;
      }
    }

    if (typeof x === "number" && Number.isFinite(x)) {
      speakers.push({
        id: s.track_id || s.speaker_id || s.id || `speaker_${speakers.length + 1}`,
        x,
      });
    }
  }

  return { speakers, frameWidth, valid: true };
}

/**
 * Loads speaker tracks from local file path if given a string path, or returns parsed object.
 */
function loadSpeakerTracks(speakerTracksUri, defaultFrameWidth) {
  if (!speakerTracksUri || typeof speakerTracksUri !== "string" || !speakerTracksUri.trim()) {
    return { speakers: [], frameWidth: defaultFrameWidth, missing: true };
  }

  const trimmed = speakerTracksUri.trim();
  // Check if it's raw JSON string
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseSpeakerTracks(trimmed, defaultFrameWidth);
  }

  try {
    if (!fs.existsSync(trimmed)) {
      return { speakers: [], frameWidth: defaultFrameWidth, fileNotFound: true };
    }
    const content = fs.readFileSync(trimmed, "utf8");
    if (!content || !content.trim()) {
      return { speakers: [], frameWidth: defaultFrameWidth, emptyFile: true };
    }
    return parseSpeakerTracks(content, defaultFrameWidth);
  } catch (err) {
    return { speakers: [], frameWidth: defaultFrameWidth, error: err.message };
  }
}

/**
 * Evaluates whether split-screen should be triggered.
 *
 * Trigger split-screen when two active speakers' horizontal distance exceeds 35% of the frame width.
 * Fall back to normal single-speaker crop with a warning when:
 * - speakerTracksUri is missing
 * - the file is empty
 * - only one speaker is available
 */
function evaluateSplitScreen(speakerTracksUriOrData, frameWidth, config = { distanceThresholdRatio: 0.35 }) {
  if (!speakerTracksUriOrData) {
    console.warn(
      "[split-screen] Warning: speakerTracksUri is missing; falling back to normal single-speaker crop."
    );
    return {
      splitScreen: false,
      fallback: true,
      reason: "missing_speaker_tracks",
      speakers: [],
    };
  }

  let parseResult;
  if (typeof speakerTracksUriOrData === "string") {
    parseResult = loadSpeakerTracks(speakerTracksUriOrData, frameWidth);
  } else if (typeof speakerTracksUriOrData === "object") {
    parseResult = parseSpeakerTracks(speakerTracksUriOrData, frameWidth);
  } else {
    console.warn(
      "[split-screen] Warning: Invalid speakerTracks input; falling back to normal single-speaker crop."
    );
    return {
      splitScreen: false,
      fallback: true,
      reason: "invalid_input",
      speakers: [],
    };
  }

  if (parseResult.missing) {
    console.warn(
      "[split-screen] Warning: speakerTracksUri is missing; falling back to normal single-speaker crop."
    );
    return {
      splitScreen: false,
      fallback: true,
      reason: "missing_speaker_tracks",
      speakers: [],
    };
  }

  if (parseResult.fileNotFound) {
    console.warn(
      "[split-screen] Warning: speakerTracksUri file not found; falling back to normal single-speaker crop."
    );
    return {
      splitScreen: false,
      fallback: true,
      reason: "file_not_found",
      speakers: [],
    };
  }

  if (parseResult.emptyFile) {
    console.warn(
      "[split-screen] Warning: speakerTracksUri file is empty; falling back to normal single-speaker crop."
    );
    return {
      splitScreen: false,
      fallback: true,
      reason: "empty_file",
      speakers: [],
    };
  }

  if (parseResult.valid === false) {
    return {
      splitScreen: false,
      fallback: true,
      reason: parseResult.reason || "invalid_schema",
      speakers: [],
      frameWidth: parseResult.frameWidth || frameWidth,
    };
  }

  const { speakers, frameWidth: resolvedWidth } = parseResult;
  const effectiveWidth = resolvedWidth || frameWidth;

  if (!speakers || speakers.length === 0) {
    console.warn(
      "[split-screen] Warning: No speaker track coordinates available; falling back to normal single-speaker crop."
    );
    return {
      splitScreen: false,
      fallback: true,
      reason: "no_speakers",
      speakers: [],
    };
  }

  if (speakers.length === 1) {
    console.warn(
      "[split-screen] Warning: Only one speaker available; falling back to normal single-speaker crop."
    );
    return {
      splitScreen: false,
      fallback: true,
      reason: "single_speaker",
      speakers,
    };
  }

  const decision = getSplitScreenDecision(speakers[0], speakers[1], effectiveWidth, config);
  return {
    ...decision,
    speakers,
    frameWidth: effectiveWidth,
    fallback: !decision.splitScreen,
  };
}

module.exports = {
  CANONICAL_SCHEMA,
  CANONICAL_SCHEMA_VERSION,
  buildSplitScreenBlurFilter,
  buildSplitScreenFilterGraph,
  getSplitScreenDecision,
  parseSpeakerTracks,
  loadSpeakerTracks,
  evaluateSplitScreen,
};