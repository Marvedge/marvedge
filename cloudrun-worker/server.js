"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const express = require("express");
const { Storage } = require("@google-cloud/storage");
const { Firestore, FieldValue } = require("@google-cloud/firestore");
const { renderChunkFromRecipe } = require("./render");

const storage = new Storage();
const firestore = new Firestore();

const PORT = Number(process.env.PORT || 8080);
const RAW_BUCKET = process.env.RAW_BUCKET || "";
const PROCESSED_BUCKET = process.env.PROCESSED_BUCKET || "";
const RAW_PREFIX = process.env.RAW_PREFIX || "";
const PROCESSED_PREFIX = process.env.PROCESSED_PREFIX || "";
const RECIPES_COLLECTION = process.env.RECIPES_COLLECTION || "recipes";
const CHUNKS_COLLECTION = process.env.CHUNKS_COLLECTION || "chunks";
const CHUNK_DURATION_SECS = Number(process.env.CHUNK_DURATION_SECS || 10);

function must(name, value) {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function downloadRawChunkFromGcs({ bucketName, objectName, destinationPath }) {
  await storage.bucket(bucketName).file(objectName).download({ destination: destinationPath });
}

async function downloadFromUrl({ url, destinationPath }) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download source video: ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destinationPath, bytes);
}

async function uploadProcessedChunkToGcs({ bucketName, objectName, sourcePath }) {
  await storage.bucket(bucketName).upload(sourcePath, {
    destination: objectName,
    contentType: "video/mp4",
    resumable: false,
  });
}

async function getRecipeById(recipeId) {
  const snap = await firestore.collection(RECIPES_COLLECTION).doc(recipeId).get();
  if (!snap.exists) throw new Error(`Recipe not found: ${recipeId}`);
  return snap.data() || {};
}

async function updateChunkStatus(chunkId, patch) {
  await firestore.collection(CHUNKS_COLLECTION).doc(chunkId).set(
    {
      ...patch,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function processChunkJob({ chunkId, recipeId, rawObject, outputObject, recipe: inlineRecipe, videoUrl }) {
  const rawBucket = must("RAW_BUCKET", RAW_BUCKET);
  const processedBucket = must("PROCESSED_BUCKET", PROCESSED_BUCKET);
  const recipe = inlineRecipe || (await getRecipeById(recipeId));

  const sourceObject = rawObject || `${RAW_PREFIX}${chunkId}.webm`;
  const destObject = outputObject || `${PROCESSED_PREFIX}${chunkId}.mp4`;

  await updateChunkStatus(chunkId, {
    recipeId,
    status: "PROCESSING",
    rawBucket,
    rawObject: sourceObject,
    sourceUrl: videoUrl || null,
    error: FieldValue.delete(),
  });

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "marvedge-gcp-"));
  const inputPath = path.join(workDir, "input.webm");
  const outputPath = path.join(workDir, "output.mp4");

  try {
    if (videoUrl) {
      await downloadFromUrl({
        url: String(videoUrl),
        destinationPath: inputPath,
      });
    } else {
      await downloadRawChunkFromGcs({
        bucketName: rawBucket,
        objectName: sourceObject,
        destinationPath: inputPath,
      });
    }

    await renderChunkFromRecipe({
      inputPath,
      outputPath,
      chunkId,
      recipe,
      chunkDurationSecs: CHUNK_DURATION_SECS,
    });

    await uploadProcessedChunkToGcs({
      bucketName: processedBucket,
      objectName: destObject,
      sourcePath: outputPath,
    });

    await updateChunkStatus(chunkId, {
      recipeId,
      status: "DONE",
      processedBucket,
      processedObject: destObject,
      error: FieldValue.delete(),
    });

    return {
      chunkId,
      recipeId,
      status: "DONE",
      processedBucket,
      processedObject: destObject,
    };
  } catch (err) {
    await updateChunkStatus(chunkId, {
      recipeId,
      status: "FAILED",
      error: err?.message || String(err),
    });
    throw err;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post("/process", async (req, res) => {
  const { chunkId, recipeId, rawObject, outputObject, recipe, videoUrl } = req.body || {};
  if (!chunkId || !recipeId) {
    return res.status(400).json({
      ok: false,
      error: "chunkId and recipeId are required",
    });
  }

  try {
    const result = await processChunkJob({
      chunkId,
      recipeId,
      rawObject,
      outputObject,
      recipe,
      videoUrl,
    });
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    console.error("[worker] process failed:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "unknown_error",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Cloud Run worker listening on :${PORT}`);
});
