/**
 * app/lib/storage/index.ts
 *
 * Unified storage client — AWS S3 (primary) with Google Cloud Storage (fallback).
 *
 * Active provider is controlled by the STORAGE_PROVIDER environment variable:
 *   "aws" → AWS S3  (default — production standard, ap-southeast-2)
 *   "gcs" → Google Cloud Storage (cold-standby — activate ONLY on AWS outage)
 *
 * This module is the single source of truth for all object storage operations
 * in the Next.js application layer. The cloudrun-worker has its own parallel
 * implementation in cloudrun-worker/storage.cjs.
 *
 * API surface:
 *   getSignedUploadUrl(bucket, key, contentType, expiresMs) → string
 *   getSignedDownloadUrl(bucket, key, expiresMs)             → string
 *   objectExists(bucket, key)                                → boolean
 *   deleteObject(bucket, key)                                → void
 *   getObjectSize(bucket, key)                               → number | null
 *   toPublicUri(bucket, key)                                 → string  (s3:// or gs://)
 */

import {
  S3Client,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

type StorageProvider = "aws" | "gcs";

function activeProvider(): StorageProvider {
  const p = (process.env.STORAGE_PROVIDER || "aws").trim().toLowerCase();
  if (p === "gcs") return "gcs";
  return "aws"; // default — AWS is primary
}

// ---------------------------------------------------------------------------
// AWS S3 client (singleton, lazy-initialised)
// ---------------------------------------------------------------------------

let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (_s3Client) return _s3Client;
  const region = process.env.AWS_REGION || "ap-southeast-2";
  _s3Client = new S3Client({ region });
  return _s3Client;
}

// ---------------------------------------------------------------------------
// GCS client (lazy — only instantiated when STORAGE_PROVIDER=gcs)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _gcsStorage: any = null;

async function getGcsClient() {
  if (_gcsStorage) return _gcsStorage;
  const { Storage } = await import("@google-cloud/storage");
  const projectId = (
    process.env.GOOGLE_CLOUD_PROJECT_ID ||
    process.env.GCP_PROJECT_ID ||
    ""
  ).trim();
  const clientEmail = (process.env.GOOGLE_CLOUD_CLIENT_EMAIL || "").trim();
  const privateKeyRaw = process.env.GOOGLE_CLOUD_PRIVATE_KEY || "";
  const privateKey = privateKeyRaw.includes("\\n")
    ? privateKeyRaw.replace(/\\n/g, "\n")
    : privateKeyRaw;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "[storage] GCS fallback requested but GOOGLE_CLOUD_PROJECT_ID, " +
        "GOOGLE_CLOUD_CLIENT_EMAIL, and GOOGLE_CLOUD_PRIVATE_KEY are not all set. " +
        "Set STORAGE_PROVIDER=aws to use AWS S3 (primary)."
    );
  }

  _gcsStorage = new Storage({
    projectId,
    credentials: { client_email: clientEmail, private_key: privateKey },
  });
  return _gcsStorage;
}

// ---------------------------------------------------------------------------
// Public API — provider-agnostic
// ---------------------------------------------------------------------------

/**
 * Generate a presigned URL for a PUT upload.
 * Default expiry: 15 minutes.
 */
export async function getSignedUploadUrl(
  bucket: string,
  key: string,
  contentType: string,
  expiresMs = 15 * 60 * 1000
): Promise<string> {
  if (activeProvider() === "aws") {
    const client = getS3Client();
    const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
    return getSignedUrl(client, cmd, { expiresIn: Math.floor(expiresMs / 1000) });
  }

  // GCS fallback
  const gcs = await getGcsClient();
  const [url] = await gcs.bucket(bucket).file(key).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + expiresMs,
    contentType,
  });
  return url;
}

/**
 * Generate a presigned URL for a GET download.
 * Default expiry: 2 hours.
 */
export async function getSignedDownloadUrl(
  bucket: string,
  key: string,
  expiresMs = 2 * 60 * 60 * 1000
): Promise<string> {
  if (activeProvider() === "aws") {
    const client = getS3Client();
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(client, cmd, { expiresIn: Math.floor(expiresMs / 1000) });
  }

  // GCS fallback
  const gcs = await getGcsClient();
  const [url] = await gcs.bucket(bucket).file(key).getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + expiresMs,
  });
  return url;
}

/**
 * Check whether an object exists in the bucket.
 */
export async function objectExists(bucket: string, key: string): Promise<boolean> {
  if (activeProvider() === "aws") {
    try {
      await getS3Client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  // GCS fallback
  const gcs = await getGcsClient();
  const [exists] = await gcs.bucket(bucket).file(key).exists();
  return exists;
}

/**
 * Get the stored size of an object in bytes.
 * Returns null if the object does not exist or the size is unavailable.
 */
export async function getObjectSize(bucket: string, key: string): Promise<number | null> {
  if (activeProvider() === "aws") {
    try {
      const resp = await getS3Client().send(
        new HeadObjectCommand({ Bucket: bucket, Key: key })
      );
      return typeof resp.ContentLength === "number" ? resp.ContentLength : null;
    } catch {
      return null;
    }
  }

  // GCS fallback
  const gcs = await getGcsClient();
  const [metadata] = await gcs.bucket(bucket).file(key).getMetadata();
  const size = Number(metadata.size);
  return Number.isFinite(size) ? size : null;
}

/**
 * Delete an object. Silently succeeds if the object does not exist.
 */
export async function deleteObject(bucket: string, key: string): Promise<void> {
  if (activeProvider() === "aws") {
    await getS3Client()
      .send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
      .catch(() => undefined);
    return;
  }

  // GCS fallback
  const gcs = await getGcsClient();
  await gcs.bucket(bucket).file(key).delete().catch(() => undefined);
}

/**
 * Returns the canonical URI for an object (s3:// or gs://).
 * Use this wherever the application stores object references — never hardcode
 * the storage scheme.
 */
export function toPublicUri(bucket: string, key: string): string {
  return activeProvider() === "aws"
    ? `s3://${bucket}/${key}`
    : `gs://${bucket}/${key}`;
}

/**
 * Returns true if the given URI matches the active provider's scheme.
 * Useful for validating incoming URIs before resolving them.
 */
export function isNativeUri(uri: string): boolean {
  if (activeProvider() === "aws") return uri.startsWith("s3://");
  return uri.startsWith("gs://");
}

/**
 * Parses a native storage URI (s3:// or gs://) into bucket + key.
 * Returns null for invalid or mismatched scheme URIs.
 */
export function parseStorageUri(uri: string): { bucket: string; key: string } | null {
  const match = uri.match(/^(?:s3|gs):\/\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return { bucket: match[1], key: match[2] };
}
