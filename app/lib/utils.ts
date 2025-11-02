import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { ZoomEffect } from "../types/editor/zoom-effect";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Toggle zoom effect function
 * @param onZoomEffectCreate - Callback to create zoom effect
 * @param currentTime - Current video time
 * @param duration - Video duration
 * @param setzoomed - State setter for zoomed status
 * @returns void
 */
export const toggleZoom = (
  onZoomEffectCreate: ((effect: ZoomEffect) => void) | undefined,
  currentTime: number,
  duration: number,
  setzoomed: (value: boolean | ((prev: boolean) => boolean)) => void
): void => {
  if (onZoomEffectCreate) {
    const testEffect: ZoomEffect = {
      id: Date.now().toString(),
      startTime: Math.max(0, currentTime - 1),
      endTime: Math.min(duration, currentTime + 2),
      zoomLevel: 2.0,
      x: 0.5,
      y: 0.5,
    };
    onZoomEffectCreate(testEffect);
  }
  setzoomed((z) => !z);
};

/**
 * Generate triangle points for SVG polygon
 * @param x - X coordinate of triangle center
 * @param y - Y coordinate of triangle center
 * @param w - Width of triangle
 * @param h - Height of triangle
 * @param direction - Direction of triangle ("up" or "down")
 * @returns SVG polygon points string
 */
export const trianglePoints = (
  x: number,
  y: number,
  w: number,
  h: number,
  direction: "up" | "down"
): string => {
  if (direction === "down") {
    return `${x},${y} ${x - w / 2},${y + h} ${x + w / 2},${y + h}`;
  } else {
    return `${x},${y} ${x - w / 2},${y - h} ${x + w / 2},${y - h}`;
  }
};
