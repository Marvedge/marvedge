export interface SplitScreenBlurConfig {
  width: number;
  height: number;
  blurStrength?: number;
}

function validateConfig(config: SplitScreenBlurConfig): void {
  if (!Number.isInteger(config.width) || config.width <= 0) {
    throw new Error("Width must be a positive integer.");
  }

  if (!Number.isInteger(config.height) || config.height <= 0) {
    throw new Error("Height must be a positive integer.");
  }

  const blurStrength = config.blurStrength ?? 20;

  if (!Number.isFinite(blurStrength) || blurStrength < 0) {
    throw new Error("Blur strength must be a finite, non-negative number.");
  }
}

export function buildSplitScreenBlurFilter(
  config: SplitScreenBlurConfig
): string {
  validateConfig(config);

  const { width, height } = config;
  const blurStrength = config.blurStrength ?? 20;

  return [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    `gblur=sigma=${blurStrength}`,
    "setsar=1",
    "format=yuv420p",
  ].join(",");
}
