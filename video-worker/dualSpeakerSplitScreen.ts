export interface SpeakerPoint {
  x: number;
}

export interface SplitScreenConfig {
  distanceThresholdRatio: number;
}

export interface SplitScreenDecision {
  splitScreen: boolean;
  horizontalDistance: number;
  threshold: number;
}

/**
 * Determines whether two speakers are far enough apart horizontally
 * to trigger split-screen mode.
 *
 * Split-screen is triggered when:
 * horizontal distance > 35% of source frame width.
 */
export function getSplitScreenDecision(
  speaker1: SpeakerPoint,
  speaker2: SpeakerPoint,
  frameWidth: number,
  config: SplitScreenConfig = {
    distanceThresholdRatio: 0.35,
  }
): SplitScreenDecision {
  if (
    !Number.isFinite(frameWidth) ||
    frameWidth <= 0 ||
    !Number.isFinite(speaker1.x) ||
    !Number.isFinite(speaker2.x)
  ) {
    return {
      splitScreen: false,
      horizontalDistance: 0,
      threshold: 0,
    };
  }

  const horizontalDistance = Math.abs(speaker1.x - speaker2.x);
  const threshold = config.distanceThresholdRatio * frameWidth;

  return {
    splitScreen: horizontalDistance > threshold,
    horizontalDistance,
    threshold,
  };
}