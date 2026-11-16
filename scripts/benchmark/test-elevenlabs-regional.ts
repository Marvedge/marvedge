import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

async function main() {
  dotenv.config({ path: ".env.local" });
  dotenv.config({ path: ".env", override: false });

  for (const key of [
    "ELEVENLABS_API_KEY",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ]) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  const sourcePath = "C:/marvedge-task53-media/columbia/col_excerpt_30s.mp4";

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source clip not found: ${sourcePath}`);
  }

  const { v2: cloudinary } = await import("cloudinary");

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  let uploadedPublicId: string | undefined;
  let providerJobCreated = false;

  try {
    console.log("Uploading the 30-second test clip...");
    const upload = await cloudinary.uploader.upload(sourcePath, {
      resource_type: "video",
      folder: "marvedge-temporary-tests",
      public_id: `regional-hi-${Date.now()}`,
      overwrite: false,
    });

    uploadedPublicId = upload.public_id;
    console.log("Temporary upload complete.");

    const { createDubbingJob, waitForDubbingCompletion, getDubbedAudio, getAudioExtension } =
      await import("../../app/lib/elevenlabs/dubbing");

    console.log("Creating ONE Hindi dubbing job...");
    const job = await createDubbingJob({
  sourceUrl: upload.secure_url,
  targetLanguage: "hi",
  watermark: true,
});
    providerJobCreated = true;

    console.log(`Provider job created: ${job.dubbingId}`);
    const checkpointPath = path.join(path.dirname(sourcePath), "marvedge-hindi-test-job.json");

    fs.writeFileSync(
      checkpointPath,
      JSON.stringify(
        {
          dubbingId: job.dubbingId,
          targetLanguage: "hi",
          sourceUrl: upload.secure_url,
          uploadedPublicId,
          createdAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    console.log(`Job checkpoint saved: ${checkpointPath}`);
    console.log("Waiting for completion...");

    const completed = await waitForDubbingCompletion(job.dubbingId, {
      intervalMs: 5000,
      timeoutMs: 10 * 60 * 1000,
    });

    console.log(`Provider status: ${completed.status}`);
    console.log("Retrieving the generated Hindi audio...");

    const result = await getDubbedAudio(job.dubbingId, "hi");
    const extension = getAudioExtension(result.contentType);
    const outputPath = path.join(
      path.dirname(sourcePath),
      `col_excerpt_30s_hindi_dub_${Date.now()}.${extension}`
    );

    fs.writeFileSync(outputPath, result.audio);

    console.log("REAL DUBBING AUDIO SAVED");
    console.log(`File: ${outputPath}`);
    console.log(`Content type: ${result.contentType}`);
    console.log(`Bytes: ${result.audio.length}`);
  } finally {
    if (uploadedPublicId && !providerJobCreated) {
      try {
        await cloudinary.uploader.destroy(uploadedPublicId, {
          resource_type: "video",
          invalidate: true,
        });
        console.log("Temporary Cloudinary upload deleted.");
      } catch {
        console.error(
          "WARNING: Could not delete temporary upload. Remove it from Cloudinary manually."
        );
      }
    }

    if (providerJobCreated) {
      console.log(
        "Provider job exists. Keep the source asset until its final status is confirmed."
      );
    }
  }
}

main().catch((error) => {
  console.error("Regional dubbing test failed:", error);
  process.exitCode = 1;
});
