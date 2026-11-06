// Shared, defensive rendering of the `Demo.editing` fields that reach CSS on
// the public share pages. Rows written before editing validation existed can
// still contain hostile values, so this module never trusts the stored blob.

import type { CSSProperties } from "react";

import { isSafeBackgroundUrl, isSafeBackgroundValue } from "@/app/lib/demos/editing";

const IMAGE_MAP: Record<string, string> = {
  def_mac_1: "/background-default-images/mac-1.jpg",
  def_mac_2: "/background-default-images/mac-2.jpg",
  def_mac_3: "/background-default-images/mac-3.jpg",
  def_mac_4: "/background-default-images/mac-4.jpg",
  def_windows_1: "/background-default-images/windows-1.jpg",
  def_windows_2: "/background-default-images/windows-2.jpg",
  def_windows_3: "/background-default-images/windows-3.png",
  def_windows_4: "/background-default-images/windows-4.jpg",
  solid_blue_1: "/solid/blue-1.png",
  solid_blue_2: "/solid/blue-2.png",
  solid_blue_3: "/solid/blue-3.png",
  solid_blue_4: "/solid/blue-4.png",
  solid_green_1: "/solid/green-1.png",
  solid_green_2: "/solid/green-2.png",
  solid_green_3: "/solid/green-3.png",
  solid_green_4: "/solid/green-4.png",
  solid_orange_1: "/solid/orange-1.png",
  solid_orange_2: "/solid/orange-2.png",
  solid_orange_3: "/solid/orange-3.png",
  solid_orange_4: "/solid/orange-4.png",
  solid_red_1: "/solid/red-1.jpg",
  solid_red_2: "/solid/red-2.jpg",
  solid_red_3: "/solid/red-3.jpg",
  solid_red_4: "/solid/red-4.jpg",
  solid_yellow_1: "/solid/yellow-1.png",
  solid_yellow_2: "/solid/yellow-2.png",
  solid_yellow_3: "/solid/yellow-3.png",
  solid_yellow_4: "/solid/yellow-4.png",
  grad_dark_1: "/gradient/gradient_dark-1.jpg",
  grad_dark_2: "/gradient/gradient_dark-2.jpg",
  grad_dark_3: "/gradient/gradient_dark-3.jpg",
  grad_dark_4: "/gradient/gradient_dark-4.jpg",
  grad_light_1: "/gradient/gradient_light-1.png",
  grad_light_2: "/gradient/gradient_light-2.jpg",
  grad_light_3: "/gradient/gradient_light-3.png",
  grad_light_4: "/gradient/gradient_light-4.jpg",
};

const GRADIENT_MAP: Record<string, string> = {
  sunset: "linear-gradient(135deg, #f093fb 0%, #f5576c 50%, #4facfe 100%)",
  ocean: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  mint: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
  royal: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  steel: "linear-gradient(135deg, #bdc3c7 0%, #2c3e50 100%)",
  candy: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
};

function backgroundSelection(editing: unknown): string | null {
  if (typeof editing !== "object" || editing === null || Array.isArray(editing)) {
    return null;
  }
  const parsed = editing as Record<string, unknown>;
  const candidate =
    typeof parsed.background === "string"
      ? parsed.background
      : typeof parsed.selectedBackground === "string"
        ? parsed.selectedBackground
        : null;
  return candidate && isSafeBackgroundValue(candidate) ? candidate : null;
}

/**
 * Build the share page background from a stored editing blob, falling back to
 * the caller's default for anything missing or not recognised.
 */
export function shareBackgroundStyle(editing: unknown, fallback: CSSProperties): CSSProperties {
  const selection = backgroundSelection(editing);
  if (!selection || selection === "none" || selection === "hidden" || selection === "transparent") {
    return fallback;
  }

  if (selection === "custom") {
    const parsed = editing as Record<string, unknown>;
    const url = parsed.customBackgroundUrl;
    if (!isSafeBackgroundUrl(url)) {
      return fallback;
    }
    // URL.href is already parsed; encodeURI neutralises quotes and backslashes
    // that would otherwise let a value escape the CSS url("...") string.
    return {
      backgroundImage: `url("${encodeURI(new URL((url as string).trim()).href)}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }

  if (selection.startsWith("gradient:")) {
    const gradient = GRADIENT_MAP[selection.slice("gradient:".length)];
    return gradient ? { background: gradient } : fallback;
  }

  if (selection.startsWith("color:")) {
    return { backgroundColor: selection.slice("color:".length) };
  }

  const image = IMAGE_MAP[selection];
  if (image) {
    return {
      backgroundImage: `url(${image})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }

  return fallback;
}

/** Only a real ratio or the literal "native" reaches the player. */
export function shareAspectRatio(editing: unknown, fallback = "16:9"): string {
  if (typeof editing !== "object" || editing === null || Array.isArray(editing)) {
    return fallback;
  }
  const value = (editing as Record<string, unknown>).aspectRatio;
  if (typeof value !== "string") {
    return fallback;
  }
  if (value === "native" || /^\d{1,2}:\d{1,2}$/.test(value)) {
    return value;
  }
  return fallback;
}
