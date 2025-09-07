import { ZoomEffect } from "../interfaces/editor/IZoomEffect";

export const testZoomEffectCreation = () => {
  console.log("=== TESTING ZOOM EFFECT CREATION ===");

  // Simulate the zoom effect creation from the UI
  const testEffect: ZoomEffect = {
    id: Date.now().toString(),
    startTime: 0,
    endTime: 5,
    zoomLevel: 2.0, // This should be 2x zoom
    x: 0.5, // Center x
    y: 0.5, // Center y
  };

  console.log("Created test zoom effect:", testEffect);

  // Validate the effect
  if (testEffect.zoomLevel <= 1.0) {
    console.error("❌ Zoom level is too low:", testEffect.zoomLevel);
    console.log("Expected: > 1.0, Got:", testEffect.zoomLevel);
  } else {
    console.log("✅ Zoom level is correct:", testEffect.zoomLevel);
  }

  if (
    testEffect.x < 0 ||
    testEffect.x > 1 ||
    testEffect.y < 0 ||
    testEffect.y > 1
  ) {
    console.error("❌ Coordinates are out of range:", {
      x: testEffect.x,
      y: testEffect.y,
    });
  } else {
    console.log("✅ Coordinates are correct:", {
      x: testEffect.x,
      y: testEffect.y,
    });
  }

  // Test the zoom calculation
  const zoomScale = Math.max(1.0, testEffect.zoomLevel);
  const centerX = testEffect.x * 1280;
  const centerY = testEffect.y * 720;

  console.log("Calculated zoom parameters:", {
    zoomScale,
    centerX,
    centerY,
  });

  // Test FFmpeg filter generation
  const filter = `zoompan=z='${zoomScale}':x='${centerX}':y='${centerY}':d=1:s=1280x720`;
  console.log("Generated FFmpeg filter:", filter);

  console.log("=== ZOOM EFFECT CREATION TEST COMPLETE ===");

  return testEffect;
};
