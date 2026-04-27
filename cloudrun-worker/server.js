"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

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
const execFileAsync = promisify(execFile);

function must(name, value) {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function downloadRawChunkFromGcs({
  bucketName,
  objectName,
  destinationPath,
}) {
  await storage
    .bucket(bucketName)
    .file(objectName)
    .download({ destination: destinationPath });
}

function parseGsUri(uri) {
  if (typeof uri !== "string" || !uri.startsWith("gs://")) {
    return null;
  }
  const trimmed = uri.slice("gs://".length);
  const slashIndex = trimmed.indexOf("/");
  if (slashIndex <= 0) {
    return null;
  }
  const bucket = trimmed.slice(0, slashIndex);
  const object = trimmed.slice(slashIndex + 1);
  if (!bucket || !object) {
    return null;
  }
  return { bucket, object };
}

async function downloadFromGsUri({ uri, destinationPath }) {
  const parsed = parseGsUri(uri);
  if (!parsed) {
    throw new Error(`Invalid gs:// uri: ${uri}`);
  }
  await downloadRawChunkFromGcs({
    bucketName: parsed.bucket,
    objectName: parsed.object,
    destinationPath,
  });
}

async function getSignedHttpUrlForGsUri(uri) {
  const parsed = parseGsUri(uri);
  if (!parsed) {
    throw new Error(`Invalid gs:// uri: ${uri}`);
  }
  const [signedUrl] = await storage
    .bucket(parsed.bucket)
    .file(parsed.object)
    .getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 2 * 60 * 60 * 1000,
    });
  return signedUrl;
}

async function downloadFromUrl({ url, destinationPath }) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download source video: ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destinationPath, bytes);
}

async function extractAudioWav16kMono(inputPath, wavPath) {
  await execFileAsync("/usr/bin/ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    wavPath,
  ]);
}

function cuesFromDeepgramWords(words) {
  if (!Array.isArray(words) || words.length === 0) return [];
  const cues = [];
  let cueStart = Number(words[0].start || 0);
  let cueEnd = Number(words[0].end || cueStart + 0.3);
  let text = String(words[0].punctuated_word || words[0].word || "").trim();

  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    const wText = String(w.punctuated_word || w.word || "").trim();
    const wStart = Number(w.start || cueEnd);
    const wEnd = Number(w.end || wStart + 0.25);
    const gap = wStart - cueEnd;
    const nextTextLen = (text + " " + wText).trim().length;
    const cueDur = cueEnd - cueStart;
    const shouldBreak = gap > 0.8 || cueDur > 4.2 || nextTextLen > 56;

    if (shouldBreak && text) {
      cues.push({
        start: Math.max(0, cueStart),
        end: Math.max(cueStart + 0.04, cueEnd),
        text: text.trim(),
      });
      cueStart = wStart;
      cueEnd = wEnd;
      text = wText;
    } else {
      cueEnd = Math.max(cueEnd, wEnd);
      text = `${text} ${wText}`.trim();
    }
  }

  if (text) {
    cues.push({
      start: Math.max(0, cueStart),
      end: Math.max(cueStart + 0.04, cueEnd),
      text: text.trim(),
    });
  }
  return cues.filter((c) => c.text.length > 0 && c.end - c.start > 0.01);
}

async function transcribeWithDeepgram(wavPath, language = "multi") {
  const apiKey = (process.env.DEEPGRAM_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("Missing DEEPGRAM_API_KEY in Cloud Run environment");
  }

  const params = new URLSearchParams({
    model: "nova-2",
    punctuate: "true",
    smart_format: "true",
  });
  if (language && language !== "multi") {
    params.set("language", language);
  } else {
    params.set("detect_language", "true");
  }

  const audio = await fs.readFile(wavPath);
  const resp = await fetch(
    `https://api.deepgram.com/v1/listen?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "audio/wav",
      },
      body: audio,
    },
  );

  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(
      `Deepgram failed (${resp.status}): ${typeof body === "object" ? JSON.stringify(body) : String(body)}`,
    );
  }

  const words = body?.results?.channels?.[0]?.alternatives?.[0]?.words || [];
  const cues = cuesFromDeepgramWords(words);
  if (cues.length > 0) return cues;

  const transcript = String(
    body?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "",
  ).trim();
  if (!transcript) return [];
  return [{ start: 0, end: 3, text: transcript }];
}

async function processSubtitlesJob({ videoUrl, language }) {
  if (!videoUrl) throw new Error("videoUrl is required");
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "marvedge-subtitles-"),
  );
  const inputPath = path.join(tempDir, "input.webm");
  const wavPath = path.join(tempDir, "audio.wav");
  const startedAt = Date.now();
  try {
    const dlStart = Date.now();
    if (typeof videoUrl === "string" && videoUrl.startsWith("gs://")) {
      await downloadFromGsUri({
        uri: String(videoUrl),
        destinationPath: inputPath,
      });
    } else {
      await downloadFromUrl({
        url: String(videoUrl),
        destinationPath: inputPath,
      });
    }
    const dlMs = Date.now() - dlStart;

    const exStart = Date.now();
    await extractAudioWav16kMono(inputPath, wavPath);
    const extractMs = Date.now() - exStart;

    const dgStart = Date.now();
    const cues = await transcribeWithDeepgram(
      wavPath,
      String(language || "multi"),
    );
    const deepgramMs = Date.now() - dgStart;

    console.log(
      `[subtitles] Timing download_ms=${dlMs} extract_ms=${extractMs} deepgram_ms=${deepgramMs} total_ms=${Date.now() - startedAt} cues=${cues.length}`,
    );
    return cues;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function uploadProcessedChunkToGcs({
  bucketName,
  objectName,
  sourcePath,
}) {
  await storage.bucket(bucketName).upload(sourcePath, {
    destination: objectName,
    contentType: "video/mp4",
    resumable: false,
  });
}

async function getRecipeById(recipeId) {
  const snap = await firestore
    .collection(RECIPES_COLLECTION)
    .doc(recipeId)
    .get();
  if (!snap.exists) {
    throw new Error(`Recipe not found: ${recipeId}`);
  }
  return snap.data() || {};
}

async function updateChunkStatus(chunkId, patch) {
  await firestore
    .collection(CHUNKS_COLLECTION)
    .doc(chunkId)
    .set(
      {
        ...patch,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

async function processChunkJob({
  chunkId,
  recipeId,
  rawObject,
  outputObject,
  recipe: inlineRecipe,
  videoUrl,
  startTime,
  duration,
}) {
  const totalStartMs = Date.now();
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
  let inputPath = path.join(workDir, "input.webm");
  const outputPath = path.join(workDir, "output.mp4");

  try {
    const dlStartMs = Date.now();
    let dlMs = 0;

    if (
      typeof startTime === "number" &&
      typeof duration === "number" &&
      videoUrl
    ) {
      // Logical splitting: Skip physical download, use URL directly as inputPath.
      // For gs:// sources, sign URL so ffmpeg can stream it.
      if (String(videoUrl).startsWith("gs://")) {
        inputPath = await getSignedHttpUrlForGsUri(String(videoUrl));
      } else {
        inputPath = String(videoUrl);
      }
    } else if (videoUrl) {
      if (String(videoUrl).startsWith("gs://")) {
        await downloadFromGsUri({
          uri: String(videoUrl),
          destinationPath: inputPath,
        });
      } else {
        await downloadFromUrl({
          url: String(videoUrl),
          destinationPath: inputPath,
        });
      }
      dlMs = Date.now() - dlStartMs;
    } else {
      await downloadRawChunkFromGcs({
        bucketName: rawBucket,
        objectName: sourceObject,
        destinationPath: inputPath,
      });
      dlMs = Date.now() - dlStartMs;
    }

    let inputBytes = 0;
    try {
      inputBytes = (await fs.stat(inputPath)).size;
    } catch {
      // Ignore stats failures.
    }

    const renderStartMs = Date.now();
    await renderChunkFromRecipe({
      inputPath,
      outputPath,
      chunkId,
      recipe,
      chunkDurationSecs: CHUNK_DURATION_SECS,
      startTime,
      duration,
    });
    const renderMs = Date.now() - renderStartMs;

    let outputBytes = 0;
    try {
      outputBytes = (await fs.stat(outputPath)).size;
    } catch {
      // Ignore stats failures.
    }

    const uploadStartMs = Date.now();
    await uploadProcessedChunkToGcs({
      bucketName: processedBucket,
      objectName: destObject,
      sourcePath: outputPath,
    });
    const uploadMs = Date.now() - uploadStartMs;
    const totalMs = Date.now() - totalStartMs;

    console.log(
      `[${chunkId}] Timing download_ms=${dlMs} render_ms=${renderMs} upload_ms=${uploadMs} total_ms=${totalMs} ` +
        `input_mb=${(inputBytes / 1048576).toFixed(2)} output_mb=${(outputBytes / 1048576).toFixed(2)}`,
    );

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
  const {
    chunkId,
    recipeId,
    rawObject,
    outputObject,
    recipe,
    videoUrl,
    startTime,
    duration,
  } = req.body || {};
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
      startTime,
      duration,
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

app.post("/subtitles", async (req, res) => {
  const { videoUrl, language } = req.body || {};
  if (!videoUrl) {
    return res.status(400).json({ ok: false, error: "videoUrl is required" });
  }
  try {
    const cues = await processSubtitlesJob({ videoUrl, language });
    return res.status(200).json({
      ok: true,
      result: {
        recipeId: "subtitles",
        cues,
      },
    });
  } catch (err) {
    console.error("[worker] subtitles failed:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "unknown_error",
    });
  }
});

app.post("/merge", async (req, res) => {
  const { recipeId, chunkFilenames } = req.body || {};
  if (
    !recipeId ||
    !Array.isArray(chunkFilenames) ||
    chunkFilenames.length === 0
  ) {
    return res.status(400).json({
      ok: false,
      error: "recipeId and chunkFilenames array are required",
    });
  }

  const processedBucket = must("PROCESSED_BUCKET", PROCESSED_BUCKET);
  const workDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "marvedge-gcp-merge-"),
  );
  const finalFilename = `${recipeId}.mp4`;
  const finalPath = path.join(workDir, finalFilename);
  const concatTextPath = path.join(workDir, "concat.txt");

  try {
    let concatLines = "";
    for (let i = 0; i < chunkFilenames.length; i++) {
      const chunkName = chunkFilenames[i];
      const localChunkPath = path.join(workDir, chunkName);
      await downloadRawChunkFromGcs({
        bucketName: processedBucket,
        objectName: chunkName,
        destinationPath: localChunkPath,
      });
      concatLines += `file '${chunkName}'\n`;
    }

    await fs.writeFile(concatTextPath, concatLines);

    await new Promise((resolve, reject) => {
      require("fluent-ffmpeg")()
        .input(concatTextPath)
        .inputOptions(["-f concat", "-safe 0"])
        .outputOptions("-c copy")
        .output(finalPath)
        .on("end", resolve)
        .on("error", reject)
        .run();
    });

    await uploadProcessedChunkToGcs({
      bucketName: processedBucket,
      objectName: finalFilename,
      sourcePath: finalPath,
    });

    const fileRef = storage.bucket(processedBucket).file(finalFilename);
    try {
      await fileRef.makePublic();
    } catch (e) {
      /* Ignore if UBLA is enforced */
    }

    const publicUrl = `https://storage.googleapis.com/${processedBucket}/${finalFilename}`;

    for (let i = 0; i < chunkFilenames.length; i++) {
      storage
        .bucket(processedBucket)
        .file(chunkFilenames[i])
        .delete()
        .catch(() => {});
    }

    return res.status(200).json({
      ok: true,
      result: {
        recipeId,
        mergedObject: finalFilename,
        exportedUrl: publicUrl,
      },
    });
  } catch (err) {
    console.error("[worker] merge failed:", err);
    return res
      .status(500)
      .json({ ok: false, error: err?.message || "unknown_error" });
  } finally {
    fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.listen(PORT, () => {
  console.log(`Cloud Run worker listening on :${PORT}`);
});
