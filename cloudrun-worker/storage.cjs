/**
 * cloudrun-worker/storage.cjs
 *
 * AWS S3 storage client for the cloudrun-worker (CommonJS).
 * Replaces all @google-cloud/storage calls in server.js.
 *
 * Provider: AWS S3 (primary, ap-southeast-2)
 * Fallback:  Google Cloud Storage — only instantiated when STORAGE_PROVIDER=gcs
 *
 * Exported functions mirror the GCS API that server.js already used so that
 * call-site diffs are minimal.
 */

"use strict";

const { S3Client, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const fs = require("node:fs/promises");
const { createWriteStream } = require("node:fs");
const { pipeline } = require("node:stream/promises");
const { Readable } = require("node:stream");

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

function activeProvider() {
  const p = (process.env.STORAGE_PROVIDER || "aws").trim().toLowerCase();
  return p === "gcs" ? "gcs" : "aws";
}

// ---------------------------------------------------------------------------
// AWS S3 singleton
// ---------------------------------------------------------------------------

let _s3 = null;
function getS3() {
  if (_s3) return _s3;
  _s3 = new S3Client({ region: process.env.AWS_REGION || "ap-southeast-2" });
  return _s3;
}

// ---------------------------------------------------------------------------
// GCS singleton (lazy — only when STORAGE_PROVIDER=gcs)
// ---------------------------------------------------------------------------

let _gcs = null;
function getGcs() {
  if (_gcs) return _gcs;
  const { Storage } = require("@google-cloud/storage");
  _gcs = new Storage();
  return _gcs;
}

// ---------------------------------------------------------------------------
// Download: bucket + key → local file path
// ---------------------------------------------------------------------------

/**
 * Download an object from S3 or GCS to a local file.
 */
async function downloadObject({ bucketName, objectName, destinationPath }) {
  if (activeProvider() === "aws") {
    const resp = await getS3().send(
      new GetObjectCommand({ Bucket: bucketName, Key: objectName })
    );
    const body = resp.Body;
    if (!body) throw new Error(`[storage] Empty body for s3://${bucketName}/${objectName}`);
    const writeStream = createWriteStream(destinationPath);
    await pipeline(Readable.from(body), writeStream);
    return;
  }
  // GCS fallback
  await getGcs().bucket(bucketName).file(objectName).download({ destination: destinationPath });
}

// ---------------------------------------------------------------------------
// Parse storage URIs (s3:// and gs://)
// ---------------------------------------------------------------------------

function parseS3Uri(uri) {
  if (typeof uri !== "string" || !uri.startsWith("s3://")) return null;
  const raw = uri.slice("s3://".length);
  const idx = raw.indexOf("/");
  if (idx <= 0) return null;
  return { bucket: raw.slice(0, idx), object: raw.slice(idx + 1) };
}

function parseGsUri(uri) {
  if (typeof uri !== "string" || !uri.startsWith("gs://")) return null;
  const raw = uri.slice("gs://".length);
  const idx = raw.indexOf("/");
  if (idx <= 0) return null;
  return { bucket: raw.slice(0, idx), object: raw.slice(idx + 1) };
}

/**
 * Parse a native storage URI — handles both s3:// and gs:// regardless of
 * active provider, so legacy gs:// references in the database still resolve.
 */
function parseStorageUri(uri) {
  return parseS3Uri(uri) || parseGsUri(uri);
}

// ---------------------------------------------------------------------------
// Download from URI (s3:// or gs://)
// ---------------------------------------------------------------------------

async function downloadFromUri({ uri, destinationPath }) {
  const parsed = parseStorageUri(uri);
  if (!parsed) throw new Error(`[storage] Invalid storage URI: ${uri}`);
  await downloadObject({ bucketName: parsed.bucket, objectName: parsed.object, destinationPath });
}

// ---------------------------------------------------------------------------
// Upload: local file → bucket + key
// ---------------------------------------------------------------------------

async function uploadObject({ bucketName, objectName, sourcePath, contentType = "video/mp4" }) {
  if (activeProvider() === "aws") {
    const body = await fs.readFile(sourcePath);
    await getS3().send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: objectName,
        Body: body,
        ContentType: contentType,
      })
    );
    return;
  }
  // GCS fallback
  await getGcs().bucket(bucketName).upload(sourcePath, {
    destination: objectName,
    contentType,
    resumable: false,
  });
}

// ---------------------------------------------------------------------------
// Presigned download URL
// ---------------------------------------------------------------------------

async function getSignedDownloadUrl({ bucket, key, expiresMs = 2 * 60 * 60 * 1000 }) {
  if (activeProvider() === "aws") {
    return getSignedUrl(
      getS3(),
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: Math.floor(expiresMs / 1000) }
    );
  }
  // GCS fallback
  const [url] = await getGcs().bucket(bucket).file(key).getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + expiresMs,
  });
  return url;
}

/**
 * Resolve a storage URI (s3:// or gs://) to a short-lived HTTPS download URL.
 * This replaces getSignedHttpUrlForGsUri() in server.js.
 */
async function getSignedUrlForUri(uri, expiresMs = 2 * 60 * 60 * 1000) {
  const parsed = parseStorageUri(uri);
  if (!parsed) throw new Error(`[storage] Invalid storage URI: ${uri}`);
  return getSignedDownloadUrl({ bucket: parsed.bucket, key: parsed.object, expiresMs });
}

// ---------------------------------------------------------------------------
// Object existence + size
// ---------------------------------------------------------------------------

async function objectExists(bucketName, objectName) {
  if (activeProvider() === "aws") {
    try {
      await getS3().send(new HeadObjectCommand({ Bucket: bucketName, Key: objectName }));
      return true;
    } catch {
      return false;
    }
  }
  const [exists] = await getGcs().bucket(bucketName).file(objectName).exists();
  return exists;
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

async function deleteObject(bucketName, objectName) {
  if (activeProvider() === "aws") {
    await getS3()
      .send(new DeleteObjectCommand({ Bucket: bucketName, Key: objectName }))
      .catch(() => undefined);
    return;
  }
  await getGcs().bucket(bucketName).file(objectName).delete().catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Public URL builder (for cases where bucket is public-read — R2 / public S3)
// ---------------------------------------------------------------------------

/**
 * Build a public HTTPS URL for an object.
 * For private buckets, use getSignedDownloadUrl instead.
 */
function toPublicHttpsUrl(bucketName, objectName) {
  if (activeProvider() === "aws") {
    const region = process.env.AWS_REGION || "ap-southeast-2";
    return `https://${bucketName}.s3.${region}.amazonaws.com/${objectName}`;
  }
  return `https://storage.googleapis.com/${bucketName}/${objectName}`;
}

/**
 * Build a canonical storage URI (s3:// or gs://).
 */
function toStorageUri(bucketName, objectName) {
  return activeProvider() === "aws"
    ? `s3://${bucketName}/${objectName}`
    : `gs://${bucketName}/${objectName}`;
}

module.exports = {
  activeProvider,
  downloadObject,
  downloadFromUri,
  uploadObject,
  getSignedDownloadUrl,
  getSignedUrlForUri,
  objectExists,
  deleteObject,
  toPublicHttpsUrl,
  toStorageUri,
  parseStorageUri,
  parseS3Uri,
  parseGsUri,
};
