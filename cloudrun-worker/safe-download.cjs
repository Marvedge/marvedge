"use strict";

const dns = require("node:dns");
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const net = require("node:net");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { once } = require("node:events");

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_MAX_DOWNLOAD_BYTES = 1024 * 1024 * 1024;
const MERGE_RECIPE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function parseIpv4(address) {
  const octets = address.split(".").map(Number);

  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return null;
  }

  return octets;
}

function isBlockedIpv4(address) {
  const octets = parseIpv4(address);

  if (!octets) {
    return true;
  }

  const [a, b] = octets;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isBlockedIpv6(address) {
  const normalized = address
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .split("%")[0];

  if (normalized === "::" || normalized === "::1") {
    return true;
  }

  const firstSegment = normalized.split(":")[0] || "0";
  const firstValue = Number.parseInt(firstSegment, 16);

  if (
    Number.isFinite(firstValue) &&
    ((firstValue >= 0xfc00 && firstValue <= 0xfdff) ||
      (firstValue >= 0xfe80 && firstValue <= 0xfebf) ||
      (firstValue >= 0xff00 && firstValue <= 0xffff))
  ) {
    return true;
  }

  const dottedIpv4 = normalized.match(/(\d+\.\d+\.\d+\.\d+)$/);

  if (dottedIpv4) {
    return isBlockedIpv4(dottedIpv4[1]);
  }

  const mappedIpv4 = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);

  if (mappedIpv4) {
    const high = Number.parseInt(mappedIpv4[1], 16);
    const low = Number.parseInt(mappedIpv4[2], 16);

    const ipv4Address = [(high >>> 8) & 255, high & 255, (low >>> 8) & 255, low & 255].join(".");

    return isBlockedIpv4(ipv4Address);
  }

  return false;
}

function isBlockedAddress(address) {
  const version = net.isIP(address);

  if (version === 4) {
    return isBlockedIpv4(address);
  }

  if (version === 6) {
    return isBlockedIpv6(address);
  }

  return true;
}

function isBlockedWorkerHost(hostname) {
  const host = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "");

  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  const bare = host.replace(/^\[|\]$/g, "");

  if (net.isIP(bare)) {
    return isBlockedAddress(bare);
  }

  // Reject single-label names that may resolve to internal services.
  return !bare.includes(".");
}

async function defaultLookup(hostname) {
  return dns.promises.lookup(hostname, {
    all: true,
    verbatim: true,
  });
}

async function assertSafeUrl(url, lookupImpl = defaultLookup) {
  if (!(url instanceof URL)) {
    throw new Error("Invalid source URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Refusing to fetch non-http(s) URL");
  }

  if (url.username || url.password) {
    throw new Error("Refusing source URL containing credentials");
  }

  if (isBlockedWorkerHost(url.hostname)) {
    throw new Error("Refusing to fetch blocked host");
  }

  const bareHostname = url.hostname.replace(/^\[|\]$/g, "");

  if (net.isIP(bareHostname)) {
    return;
  }

  let addresses;

  try {
    addresses = await lookupImpl(url.hostname);
  } catch {
    throw new Error("Unable to resolve source host");
  }

  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error("Unable to resolve source host");
  }

  if (addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new Error("Refusing to fetch host resolving to a private address");
  }
}

async function fetchSafeUrl(rawUrl, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const lookupImpl = options.lookupImpl ?? defaultLookup;
  const maxRedirects =
    Number.isInteger(options.maxRedirects) && options.maxRedirects >= 0
      ? options.maxRedirects
      : MAX_REDIRECTS;

  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch implementation is unavailable");
  }

  let currentUrl;

  try {
    currentUrl = new URL(String(rawUrl));
  } catch {
    throw new Error("Invalid source URL");
  }

  for (let redirectCount = 0; ; redirectCount += 1) {
    await assertSafeUrl(currentUrl, lookupImpl);

    const response = await fetchImpl(currentUrl.toString(), {
      redirect: "manual",
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    if (redirectCount >= maxRedirects) {
      throw new Error("Too many source URL redirects");
    }

    const location = response.headers?.get("location");

    if (!location) {
      throw new Error("Source URL redirect is missing a location");
    }

    try {
      currentUrl = new URL(location, currentUrl);
    } catch {
      throw new Error("Invalid source URL redirect");
    }
  }
}

/**
 * Read a positive numeric env var. NaN, Infinity, zero, negatives, blank
 * values, and (unless allowFraction is set) non-integers fall back to the
 * built-in default so an operator typo can never disable a safety limit.
 */
function readPositiveIntEnv(name, fallback, options = {}) {
  const raw = process.env[name];

  if (raw === undefined || raw === null) {
    return fallback;
  }

  const text = String(raw).trim();

  if (text === "") {
    return fallback;
  }

  const value = Number(text);

  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  if (options.allowFraction !== true && !Number.isInteger(value)) {
    return fallback;
  }

  return value;
}

/** Case-insensitive header read that works for fetch Headers and plain objects. */
function getHeader(headers, name) {
  if (!headers || typeof headers !== "object") {
    return null;
  }

  if (typeof headers.get === "function") {
    try {
      const value = headers.get(name);

      if (value !== undefined && value !== null) {
        return String(value);
      }
    } catch {
      // Fall through to plain-object lookup.
    }
  }

  const target = String(name).toLowerCase();

  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== target) {
      continue;
    }

    const value = headers[key];

    if (Array.isArray(value)) {
      return value.length > 0 ? String(value[0]) : null;
    }

    if (value !== undefined && value !== null) {
      return String(value);
    }
  }

  return null;
}

function parseContentLength(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);

  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

async function cancelResponseBody(response) {
  const body = response && response.body;

  if (!body) {
    return;
  }

  try {
    if (typeof body.cancel === "function") {
      await body.cancel();
    } else if (typeof body.destroy === "function") {
      body.destroy();
    }
  } catch {
    // Best effort: the caller is already failing the download.
  }
}

async function cancelReader(reader) {
  try {
    await reader.cancel();
  } catch {
    // Best effort: the caller is already failing the download.
  }
}

/**
 * Consume a fetch Response body into destinationPath with a hard byte cap.
 *
 * Streaming bodies are written to a sibling temp file, so peak memory stays
 * at one chunk and a body that exceeds the cap is cancelled before anything
 * appears at destinationPath. The temp file is renamed into place only after
 * the complete body has passed the cap check, and is deleted on any error.
 * Bodies without a stream interface (test doubles) use a single arrayBuffer()
 * read that is still checked against the cap.
 */
async function writeCappedResponseBody(response, destinationPath, maxBytes) {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new Error(`Invalid download size limit: ${maxBytes}`);
  }

  const contentLength = parseContentLength(
    getHeader(response && response.headers, "content-length")
  );

  if (contentLength !== null && contentLength > maxBytes) {
    await cancelResponseBody(response);
    throw new Error(
      `Refusing download: content-length ${contentLength} exceeds limit of ${maxBytes} bytes`
    );
  }

  const body = response && response.body;

  if (!body || typeof body.getReader !== "function") {
    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length > maxBytes) {
      throw new Error(`Download exceeds size limit of ${maxBytes} bytes`);
    }

    await fsPromises.writeFile(destinationPath, buffer);
    return;
  }

  const reader = body.getReader();
  const tempPath = path.join(
    path.dirname(destinationPath),
    `.${path.basename(destinationPath)}.${process.pid}.${randomUUID()}.tmp`
  );
  const writeStream = fs.createWriteStream(tempPath, { flags: "wx" });
  let received = 0;
  let streamError = null;

  writeStream.on("error", (err) => {
    streamError = err;
  });

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (streamError) {
        throw streamError;
      }

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      const chunk =
        value instanceof Uint8Array
          ? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
          : Buffer.from(value);

      received += chunk.byteLength;

      if (received > maxBytes) {
        await cancelReader(reader);
        throw new Error(`Download exceeds size limit of ${maxBytes} bytes`);
      }

      if (!writeStream.write(chunk)) {
        await once(writeStream, "drain");
      }
    }

    if (streamError) {
      throw streamError;
    }

    writeStream.end();

    if (!writeStream.closed) {
      await once(writeStream, "close");
    }

    if (streamError) {
      throw streamError;
    }

    await fsPromises.rename(tempPath, destinationPath);
  } catch (err) {
    await cancelReader(reader);

    if (!writeStream.closed) {
      writeStream.destroy();
      await once(writeStream, "close").catch(() => {});
    }

    await fsPromises.unlink(tempPath).catch(() => {});
    throw err;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Reader already released via cancel; nothing to do.
    }
  }
}

/** Allowlist for /merge recipe ids (same shape as chunk filenames). */
function isSafeRecipeId(value) {
  return typeof value === "string" && MERGE_RECIPE_ID_RE.test(value);
}

module.exports = {
  DEFAULT_MAX_DOWNLOAD_BYTES,
  MAX_REDIRECTS,
  assertSafeUrl,
  fetchSafeUrl,
  getHeader,
  isBlockedAddress,
  isBlockedWorkerHost,
  isSafeRecipeId,
  parseContentLength,
  readPositiveIntEnv,
  writeCappedResponseBody,
};
