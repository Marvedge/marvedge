import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

async function main() {
  dotenv.config({ path: ".env.local" });
  dotenv.config({ path: ".env", override: false });

  const checkpointPath = "C:/marvedge-task53-media/columbia/marvedge-kannada-test-job.json";

  if (!fs.existsSync(checkpointPath)) {
    throw new Error(`Checkpoint not found: ${checkpointPath}`);
  }

  const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8")) as {
    dubbingId: string;
    targetLanguage: string;
  };

  if (!checkpoint.dubbingId || checkpoint.targetLanguage !== "hi") {
    throw new Error("Checkpoint does not identify the expected Hindi job.");
  }

  const { waitForDubbingCompletion, getDubbedAudio, getAudioExtension } =
    await import("../../app/lib/elevenlabs/dubbing");

  console.log(`Resuming existing job: ${checkpoint.dubbingId}`);

  const completed = await waitForDubbingCompletion(checkpoint.dubbingId, {
    intervalMs: 5000,
    timeoutMs: 10 * 60 * 1000,
  });

  console.log(`Provider status: ${completed.status}`);
  console.log("Retrieving Hindi audio...");

  const result = await getDubbedAudio(checkpoint.dubbingId, "hi");

  const extension = result.mediaKind === "video" ? "mp4" : getAudioExtension(result.contentType);

  const outputPath = path.join(
    path.dirname(checkpointPath),
    `col_excerpt_30s_hindi_dub_${Date.now()}.${extension}`
  );

  fs.writeFileSync(outputPath, result.audio);

  console.log("REAL DUBBING AUDIO SAVED");
  console.log(`File: ${outputPath}`);
  console.log(`Content type: ${result.contentType}`);
  console.log(`Bytes: ${result.audio.length}`);
}

main().catch((error) => {
  console.error("Resume failed:", error);
  process.exitCode = 1;
});
