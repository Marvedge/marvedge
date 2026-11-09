// Validation for the `Demo.editing` JSON blob.
//
// The editor owns the shape, but the endpoint is public to any authenticated
// user. Persisting an arbitrary object means later readers (share pages, the
// editor preview, the export worker) each have to defend themselves. The fields
// that end up in CSS or in a URL are the dangerous ones, so those are checked
// here as well as when they are rendered. Text fields are left as data and are
// always rendered through React, which escapes them.

import { isSafeUrl } from "@/app/lib/safeUrl";

const BACKGROUND_IMAGE_KEYS = new Set([
  "def_mac_1",
  "def_mac_2",
  "def_mac_3",
  "def_mac_4",
  "def_windows_1",
  "def_windows_2",
  "def_windows_3",
  "def_windows_4",
  "solid_blue_1",
  "solid_blue_2",
  "solid_blue_3",
  "solid_blue_4",
  "solid_green_1",
  "solid_green_2",
  "solid_green_3",
  "solid_green_4",
  "solid_orange_1",
  "solid_orange_2",
  "solid_orange_3",
  "solid_orange_4",
  "solid_red_1",
  "solid_red_2",
  "solid_red_3",
  "solid_red_4",
  "solid_yellow_1",
  "solid_yellow_2",
  "solid_yellow_3",
  "solid_yellow_4",
  "grad_dark_1",
  "grad_dark_2",
  "grad_dark_3",
  "grad_dark_4",
  "grad_light_1",
  "grad_light_2",
  "grad_light_3",
  "grad_light_4",
]);

export const GRADIENT_KEYS = new Set(["sunset", "ocean", "mint", "royal", "steel", "candy"]);

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const PLAIN_TOKEN = /^[a-z0-9_-]{1,40}$/i;
const ASPECT_RATIO = /^\d{1,2}:\d{1,2}$/;

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_DEPTH = 12;
const MAX_ARRAY_LENGTH = 5000;
const MAX_OBJECT_KEYS = 200;

export type EditingValidationResult = { ok: true; value: unknown } | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneSafe(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) {
    throw new Error("Editing payload is nested too deeply");
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) {
      throw new Error("Editing payload contains too many array items");
    }
    return value.map((item) => cloneSafe(item, depth + 1));
  }
  if (!isPlainObject(value)) {
    throw new Error("Editing payload contains an unsupported value");
  }
  const keys = Object.keys(value);
  if (keys.length > MAX_OBJECT_KEYS) {
    throw new Error("Editing payload contains too many fields");
  }
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (DANGEROUS_KEYS.has(key)) {
      throw new Error("Editing payload contains a forbidden field");
    }
    result[key] = cloneSafe(value[key], depth + 1);
  }
  return result;
}

/** True for a background value the renderer knows how to draw. */
export function isSafeBackgroundValue(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (
    trimmed === "" ||
    trimmed === "none" ||
    trimmed === "hidden" ||
    trimmed === "transparent" ||
    trimmed === "custom"
  ) {
    return true;
  }
  if (trimmed.startsWith("gradient:")) {
    return GRADIENT_KEYS.has(trimmed.slice("gradient:".length));
  }
  if (trimmed.startsWith("color:")) {
    return HEX_COLOR.test(trimmed.slice("color:".length));
  }
  return BACKGROUND_IMAGE_KEYS.has(trimmed);
}

/** True for a public https URL that may be used as a background image. */
export function isSafeBackgroundUrl(value: unknown): boolean {
  if (typeof value !== "string" || !isSafeUrl(value)) {
    return false;
  }
  try {
    return new URL(value.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

function assertArray(value: unknown, field: string): void {
  if (value !== undefined && value !== null && !Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
}

function validateSubtitleStyle(value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  if (!isPlainObject(value)) {
    throw new Error("subtitleStyle must be an object");
  }

  for (const key of ["color", "backgroundColor", "outlineColor"]) {
    const color = value[key];
    if (
      color !== undefined &&
      color !== null &&
      (typeof color !== "string" || !HEX_COLOR.test(color))
    ) {
      throw new Error("subtitleStyle contains an invalid colour");
    }
  }

  const numericRanges: Record<string, [number, number]> = {
    fontSizePct: [1, 200],
    backgroundOpacity: [0, 1],
    outlineWidth: [0, 1],
    shadowDepth: [0, 1],
  };
  for (const [key, [min, max]] of Object.entries(numericRanges)) {
    const numeric = value[key];
    if (numeric === undefined || numeric === null) {
      continue;
    }
    if (
      typeof numeric !== "number" ||
      !Number.isFinite(numeric) ||
      numeric < min ||
      numeric > max
    ) {
      throw new Error("subtitleStyle contains an invalid numeric value");
    }
  }

  if (
    value.fontFamily !== undefined &&
    value.fontFamily !== null &&
    (typeof value.fontFamily !== "string" ||
      !new Set(["arial", "roboto", "inter", "poppins"]).has(value.fontFamily))
  ) {
    throw new Error("subtitleStyle contains an invalid font family");
  }

  for (const key of ["alignment", "animation"]) {
    const token = value[key];
    if (
      token !== undefined &&
      token !== null &&
      (typeof token !== "string" || !PLAIN_TOKEN.test(token))
    ) {
      throw new Error("subtitleStyle contains an invalid style token");
    }
  }
}

function validateBrowserFrame(value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  if (!isPlainObject(value)) {
    throw new Error("browserFrame must be an object");
  }
  if (
    value.mode !== undefined &&
    value.mode !== null &&
    (typeof value.mode !== "string" || !new Set(["default", "minimal", "hidden"]).has(value.mode))
  ) {
    throw new Error("browserFrame contains an invalid mode");
  }
  for (const key of ["drawShadow", "drawBorder"]) {
    if (value[key] !== undefined && value[key] !== null && typeof value[key] !== "boolean") {
      throw new Error("browserFrame contains an invalid flag");
    }
  }
}

/**
 * Validate and clone a demo editing payload before it is persisted.
 *
 * Returns `null` for an absent payload. Unknown top-level fields are preserved
 * so adding a new editor field does not require a server deploy, but their
 * values still pass through the safe clone above.
 */
export function sanitizeEditingPayload(raw: unknown): EditingValidationResult {
  if (raw === undefined || raw === null) {
    return { ok: true, value: null };
  }

  if (!isPlainObject(raw)) {
    return { ok: false, error: "Editing must be a JSON object" };
  }

  let editing: Record<string, unknown>;
  try {
    editing = cloneSafe(raw, 0) as Record<string, unknown>;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid editing payload",
    };
  }

  try {
    assertArray(editing.segments, "segments");
    assertArray(editing.zoom, "zoom");
    assertArray(editing.subtitles, "subtitles");
    assertArray(editing.textOverlays, "textOverlays");

    for (const key of ["background", "selectedBackground"]) {
      const background = editing[key];
      if (background !== undefined && background !== null && !isSafeBackgroundValue(background)) {
        throw new Error("background contains an unsupported value");
      }
    }

    if (
      editing.customBackgroundUrl !== undefined &&
      editing.customBackgroundUrl !== null &&
      editing.customBackgroundUrl !== "" &&
      !isSafeBackgroundUrl(editing.customBackgroundUrl)
    ) {
      throw new Error("customBackgroundUrl must be a public https URL");
    }

    if (
      editing.backgroundType !== undefined &&
      editing.backgroundType !== null &&
      editing.backgroundType !== "" &&
      (typeof editing.backgroundType !== "string" || !PLAIN_TOKEN.test(editing.backgroundType))
    ) {
      throw new Error("backgroundType contains an unsupported value");
    }

    if (
      editing.aspectRatio !== undefined &&
      editing.aspectRatio !== null &&
      editing.aspectRatio !== "" &&
      (typeof editing.aspectRatio !== "string" ||
        (editing.aspectRatio !== "native" && !ASPECT_RATIO.test(editing.aspectRatio)))
    ) {
      throw new Error("aspectRatio is not valid");
    }

    validateSubtitleStyle(editing.subtitleStyle);
    validateBrowserFrame(editing.browserFrame);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid editing payload",
    };
  }

  return { ok: true, value: editing };
}
