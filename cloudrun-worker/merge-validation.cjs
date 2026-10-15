"use strict";

// /merge chunk filename validation (required by server.js).
//
// chunkFilenames become local filenames under workDir, storage object names,
// and ffmpeg concat entries. Only a flat safe character set is accepted so an
// entry cannot traverse directories (../, /, \) or break out of the concat
// list (quotes). Anything else is a client error (400).

const path = require("node:path");

const CHUNK_FILENAME_RE = /^[A-Za-z0-9._-]+$/;

function isSafeChunkFilename(name) {
  return (
    typeof name === "string" &&
    CHUNK_FILENAME_RE.test(name) &&
    !name.includes("..")
  );
}

// Defense in depth: even an allowlisted name must resolve inside workDir
// before it is used as a download destination. Returns null when it escapes.
function resolveChunkPath(workDir, chunkName) {
  const resolved = path.resolve(workDir, chunkName);
  if (resolved !== workDir && resolved.startsWith(workDir + path.sep)) {
    return resolved;
  }
  return null;
}

module.exports = { CHUNK_FILENAME_RE, isSafeChunkFilename, resolveChunkPath };
