export const CROP_TARGET_SCHEMA_VERSION = 1 as const;

export interface CropCoordinateBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropTarget {
  /** Timestamp in seconds from video start */
  timestamp_sec: number;
  /** Frame index in source video (optional, 0-indexed) */
  frame?: number;
  /** Bounding box in source video pixel dimensions */
  crop: CropCoordinateBox;
  /** Saliency/detection confidence score in range [0, 1] (optional) */
  confidence?: number;
  /** Optional origin algorithm or tag (e.g. "autoflip", "speaker") */
  source?: string;
}

export interface CropTargetData {
  schema_version: typeof CROP_TARGET_SCHEMA_VERSION;
  /** Optional identifier for the video, demo, or job */
  video_id?: string;
  source: {
    width: number;
    height: number;
    fps?: number;
    duration_sec?: number;
  };
  output: {
    aspect_ratio: string;
    width?: number;
    height?: number;
  };
  timeline?: {
    timebase?: "seconds";
    sampling?: "keyframes_interpolated" | "per_frame";
  };
  crop_targets: CropTarget[];
}

export class CropTargetValidationError extends Error {
  constructor(message: string) {
    super(`Invalid cropTargets: ${message}`);
    this.name = "CropTargetValidationError";
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new CropTargetValidationError(message);
  }
}

const EPS = 0.0001;
const BOUND_EPSILON = 0.5; // pixel tolerance for rounding
const DURATION_DRIFT_TOLERANCE = 0.5; // seconds allowance for container stream drift

/**
 * Validates the minimal crop target JSON contract before persistence or FFmpeg rendering.
 * Enforces strictly monotonic timestamps, valid pixel boundaries, and numeric integrity
 * without imposing premature constraints on crop dimensions or initial timestamp offsets.
 */
export function validateCropTargetData(value: unknown): asserts value is CropTargetData {
  assert(!!value && typeof value === "object", "expected an object");
  const data = value as Record<string, unknown>;

  assert(data.schema_version === CROP_TARGET_SCHEMA_VERSION, "schema_version must be 1");
  if (data.video_id !== undefined) {
    assert(typeof data.video_id === "string", "video_id must be a string if provided");
  }

  const source = data.source;
  assert(!!source && typeof source === "object", "source is required");
  const sourceRecord = source as Record<string, unknown>;
  assert(
    isFiniteNumber(sourceRecord.width) && sourceRecord.width > 0,
    "source.width must be positive"
  );
  assert(
    isFiniteNumber(sourceRecord.height) && sourceRecord.height > 0,
    "source.height must be positive"
  );
  assert(
    sourceRecord.fps === undefined || (isFiniteNumber(sourceRecord.fps) && sourceRecord.fps > 0),
    "source.fps must be positive when present"
  );
  assert(
    sourceRecord.duration_sec === undefined ||
      (isFiniteNumber(sourceRecord.duration_sec) && sourceRecord.duration_sec >= 0),
    "source.duration_sec must be non-negative when present"
  );

  const output = data.output;
  assert(!!output && typeof output === "object", "output is required");
  const outputRecord = output as Record<string, unknown>;
  assert(
    typeof outputRecord.aspect_ratio === "string" && outputRecord.aspect_ratio.length > 0,
    "output.aspect_ratio is required"
  );
  assert(
    outputRecord.width === undefined ||
      (isFiniteNumber(outputRecord.width) && outputRecord.width > 0),
    "output.width must be positive when present"
  );
  assert(
    outputRecord.height === undefined ||
      (isFiniteNumber(outputRecord.height) && outputRecord.height > 0),
    "output.height must be positive when present"
  );

  if (data.timeline !== undefined) {
    assert(typeof data.timeline === "object" && data.timeline !== null, "timeline must be an object");
    const timelineRecord = data.timeline as Record<string, unknown>;
    if (timelineRecord.timebase !== undefined) {
      assert(timelineRecord.timebase === "seconds", "timeline.timebase must be seconds");
    }
    if (timelineRecord.sampling !== undefined) {
      assert(
        timelineRecord.sampling === "keyframes_interpolated" ||
          timelineRecord.sampling === "per_frame",
        "timeline.sampling must be keyframes_interpolated or per_frame"
      );
    }
  }

  const targets = data.crop_targets;
  assert(Array.isArray(targets), "crop_targets must be an array");
  const sourceWidth = sourceRecord.width as number;
  const sourceHeight = sourceRecord.height as number;
  const maxAllowedTimestamp =
    sourceRecord.duration_sec !== undefined
      ? (sourceRecord.duration_sec as number) + DURATION_DRIFT_TOLERANCE
      : Infinity;

  let previousTimestamp = -Infinity;

  for (const [index, target] of targets.entries()) {
    assert(!!target && typeof target === "object", `crop_targets[${index}] must be an object`);
    const targetRecord = target as Record<string, unknown>;
    const timestamp = targetRecord.timestamp_sec;
    assert(
      isFiniteNumber(timestamp) && timestamp >= 0,
      `crop_targets[${index}].timestamp_sec must be non-negative`
    );
    assert(
      timestamp <= maxAllowedTimestamp,
      `crop_targets[${index}].timestamp_sec exceeds duration`
    );
    assert(timestamp > previousTimestamp, "crop target timestamps must be strictly increasing");
    previousTimestamp = timestamp;

    if (targetRecord.frame !== undefined) {
      assert(
        Number.isInteger(targetRecord.frame) && (targetRecord.frame as number) >= 0,
        `crop_targets[${index}].frame must be a non-negative integer`
      );
    }

    if (targetRecord.source !== undefined) {
      assert(
        typeof targetRecord.source === "string" && targetRecord.source.length > 0,
        `crop_targets[${index}].source must be a non-empty string when present`
      );
    }

    const confidence = targetRecord.confidence;
    assert(
      confidence === undefined ||
        (isFiniteNumber(confidence) && confidence >= 0 && confidence <= 1),
      `crop_targets[${index}].confidence must be between 0 and 1`
    );

    const crop = targetRecord.crop;
    assert(!!crop && typeof crop === "object", `crop_targets[${index}].crop is required`);
    const cropRecord = crop as Record<string, unknown>;
    const x = cropRecord.x;
    const y = cropRecord.y;
    const width = cropRecord.width;
    const height = cropRecord.height;
    assert(isFiniteNumber(x) && x >= 0, `crop_targets[${index}].crop.x must be non-negative`);
    assert(isFiniteNumber(y) && y >= 0, `crop_targets[${index}].crop.y must be non-negative`);
    assert(
      isFiniteNumber(width) && width > 0,
      `crop_targets[${index}].crop.width must be positive`
    );
    assert(
      isFiniteNumber(height) && height > 0,
      `crop_targets[${index}].crop.height must be positive`
    );
    assert(
      x + width <= sourceWidth + BOUND_EPSILON,
      `crop_targets[${index}].crop exceeds source width`
    );
    assert(
      y + height <= sourceHeight + BOUND_EPSILON,
      `crop_targets[${index}].crop exceeds source height`
    );
  }
}

/**
 * Interpolates crop coordinate box at a specific timestamp.
 * If timestamp is before the first target, holds the first crop position.
 * If timestamp is after the last target, holds the last crop position.
 */
export function interpolateCropTarget(
  targets: CropTarget[],
  timestamp: number
): CropCoordinateBox | null {
  if (targets.length === 0) {
    return null;
  }
  if (timestamp <= targets[0].timestamp_sec) {
    return { ...targets[0].crop };
  }
  for (let i = 1; i < targets.length; i++) {
    const previous = targets[i - 1];
    const current = targets[i];
    if (timestamp <= current.timestamp_sec) {
      const progress =
        (timestamp - previous.timestamp_sec) /
        Math.max(EPS, current.timestamp_sec - previous.timestamp_sec);
      return {
        x: previous.crop.x + (current.crop.x - previous.crop.x) * progress,
        y: previous.crop.y + (current.crop.y - previous.crop.y) * progress,
        width: previous.crop.width + (current.crop.width - previous.crop.width) * progress,
        height: previous.crop.height + (current.crop.height - previous.crop.height) * progress,
      };
    }
  }
  return { ...targets[targets.length - 1].crop };
}

/**
 * Builds an FFmpeg evaluation expression for a given axis ('x' or 'y')
 * suitable for use inside FFmpeg's `crop` filter.
 */
export function buildCropExpression(
  targets: Array<{ timestamp_sec: number; crop: { x: number; y: number } }>,
  axis: "x" | "y"
): string {
  if (targets.length === 0) {
    return "0";
  }
  const value = (crop: { x: number; y: number }) => Number(crop[axis]).toFixed(4);
  if (targets.length === 1) {
    return value(targets[0].crop);
  }
  let expression = value(targets[targets.length - 1].crop);
  for (let i = targets.length - 2; i >= 0; i--) {
    const start = targets[i].timestamp_sec.toFixed(4);
    const end = targets[i + 1].timestamp_sec.toFixed(4);
    const current = value(targets[i].crop);
    const next = value(targets[i + 1].crop);
    const delta = (Number(next) - Number(current)).toFixed(4);
    const duration = Math.max(
      EPS,
      targets[i + 1].timestamp_sec - targets[i].timestamp_sec
    ).toFixed(4);
    const interpolated = `${current}+(${delta})*(t-${start})/${duration}`;
    expression = `if(lt(t,${end}),${interpolated},${expression})`;
  }
  if (targets[0].timestamp_sec > 0) {
    const firstStart = targets[0].timestamp_sec.toFixed(4);
    const firstVal = value(targets[0].crop);
    expression = `if(lt(t,${firstStart}),${firstVal},${expression})`;
  }
  return expression;
}

/**
 * Builds the FFmpeg crop filter string for a set of crop targets.
 * Uses target[0] dimensions as reference crop window and interpolates position.
 */
export function buildFfmpegCropFilter(targets: CropTarget[]): string | null {
  if (targets.length === 0) {
    return null;
  }
  const cropWidth = Math.max(1, Math.round(targets[0].crop.width));
  const cropHeight = Math.max(1, Math.round(targets[0].crop.height));
  const cropX = `min(max(${buildCropExpression(targets, "x")},0),iw-${cropWidth})`;
  const cropY = `min(max(${buildCropExpression(targets, "y")},0),ih-${cropHeight})`;
  return `crop=${cropWidth}:${cropHeight}:${cropX}:${cropY}:exact=1`;
}
