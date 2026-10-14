"use strict";

/**
 * Safely stages a worker source URL into a local file.
 *
 * HTTP(S) sources must go through the hardened downloader so DNS resolution,
 * private-address checks and every redirect hop are validated before FFmpeg is
 * allowed to process the file.
 *
 * Returns false when no URL was supplied, allowing the caller to fall back to
 * its existing raw-GCS-object path.
 */
async function prepareChunkInput({
  videoUrl,
  destinationPath,
  downloadFromGsUri,
  downloadFromUrl,
}) {
  if (!videoUrl) {
    return false;
  }

  const sourceUrl = String(videoUrl);

  if (sourceUrl.startsWith("gs://")) {
    await downloadFromGsUri({
      uri: sourceUrl,
      destinationPath,
    });
  } else {
    await downloadFromUrl({
      url: sourceUrl,
      destinationPath,
    });
  }

  return true;
}

module.exports = {
  prepareChunkInput,
};
