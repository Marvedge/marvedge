"use strict";

const dns = require("node:dns");
const net = require("node:net");

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

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
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;

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

module.exports = {
  MAX_REDIRECTS,
  assertSafeUrl,
  fetchSafeUrl,
  isBlockedAddress,
  isBlockedWorkerHost,
};
