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

// Utility: Convert seconds or "mm:ss" etc. to "HH:MM:SS"
export function normalizeTimeFormat(time: string | number): string {
  let totalSeconds: number;

  if (typeof time === "number") {
    totalSeconds = time;
  } else if (time.includes(":")) {
    // Handle "mm:ss" or "hh:mm:ss"
    const parts = time.split(":").map(Number);
    if (parts.length === 2) {
      totalSeconds = parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else {
      throw new Error("Invalid time format: " + time);
    }
  } else {
    totalSeconds = Number(time);
  }

  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(Math.floor(totalSeconds % 60)).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}