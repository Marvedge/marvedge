/* eslint-disable @typescript-eslint/no-explicit-any */
// Shared safe-download helpers for the video worker.
//
// - assertSafeDownloadUrl(): refuse private/file/gopher URLs pre-request.
//   Mirrors cloudrun-worker/safe-download.cjs semantics (literal-IP blocklist
//   + DNS re-resolution: every resolved address must be public).
// - resolveFontForDrawtext()/buildDrawtextFontOption(): never interpolate a
//   caller-supplied font family raw into a drawtext filter. Known families map
//   to explicit font files (mirrors cloudrun-worker/render.js); anything else
//   is escaped. Benign names render byte-identically to before.
// - downloadUrlToFile(): validated axios streaming download with redirect cap,
//   request timeout, and max-size abort.

import dns from "node:dns";
import net from "node:net";
import axios from "axios";
import fs from "node:fs";

export const MAX_DOWNLOAD_REDIRECTS = 5;
export const DOWNLOAD_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_DOWNLOAD_BYTES = 4 * 1024 * 1024 * 1024;

export type DnsLookupResult = Array<{ address: string; family: number }>;
export type DnsLookupFn = (hostname: string) => Promise<DnsLookupResult>;

// --- Private-address blocklist (mirrors cloudrun-worker/safe-download.cjs) ---

function parseIpv4(address: string): number[] | null {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)
  ) {
    return null;
  }
  return octets;
}

function isBlockedIpv4(address: string): boolean {
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

function isBlockedIpv6(address: string): boolean {
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

export function isBlockedAddress(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) {
    return isBlockedIpv4(address);
  }
  if (version === 6) {
    return isBlockedIpv6(address);
  }
  return true;
}

function isBlockedHost(hostname: string): boolean {
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

async function defaultLookup(hostname: string): Promise<DnsLookupResult> {
  return dns.promises.lookup(hostname, { all: true, verbatim: true }) as Promise<DnsLookupResult>;
}

/** Validate a download URL before any request is made. Returns the parsed URL. */
export async function assertSafeDownloadUrl(
  rawUrl: string,
  lookupImpl?: DnsLookupFn
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(String(rawUrl));
  } catch {
    throw new Error("Invalid source URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Refusing to fetch non-http(s) URL");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Refusing source URL containing credentials");
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new Error("Refusing to fetch blocked host");
  }
  const bareHostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(bareHostname)) {
    return parsed;
  }
  let addresses: DnsLookupResult;
  try {
    addresses = await (lookupImpl ?? defaultLookup)(parsed.hostname);
  } catch {
    throw new Error("Unable to resolve source host");
  }
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error("Unable to resolve source host");
  }
  if (addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new Error("Refusing to fetch host resolving to a private address");
  }
  return parsed;
}

// --- drawtext font resolution (mirrors cloudrun-worker/render.js) ---

const FONT_FILE_CANDIDATES: Record<string, string[]> = {
  arial: [
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  ],
  roboto: ["/usr/share/fonts/truetype/roboto/unhinted/RobotoTTF/Roboto-Regular.ttf"],
  inter: [
    "/app/fonts/Inter-Regular.ttf",
    "/usr/share/fonts/truetype/inter/Inter-Regular.ttf",
    "/usr/share/fonts/truetype/inter-vf/Inter.var.ttf",
  ],
  poppins: ["/app/fonts/Poppins-Regular.ttf"],
  caveat: ["/app/fonts/Caveat-Regular.ttf"],
  georgia: ["/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"],
};

export function resolveFontForDrawtext(fontFamily: string): {
  kind: "fontfile" | "font" | "none";
  value: string;
} {
  const raw = String(fontFamily || "").trim();
  if (!raw) {
    return { kind: "none", value: "" };
  }
  const paths = FONT_FILE_CANDIDATES[raw.toLowerCase()] || [];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        return { kind: "fontfile", value: p };
      }
    } catch {
      // Ignore stat errors and fall through to the escaped family name.
    }
  }
  return { kind: "font", value: raw };
}

/**
 * Escape a value interpolated into a drawtext filter option. Same escaping as
 * the worker's ffmpegEscapeFilterValue (backslash, colon) plus single-quote,
 * because font values sit inside '...'.
 */
export function escapeDrawtextFilterValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

/** Build the `font=...:` / `fontfile=...:` drawtext option, or "" when none. */
export function buildDrawtextFontOption(fontFamily: string): string {
  const resolved = resolveFontForDrawtext(fontFamily);
  if (resolved.kind === "fontfile" && resolved.value) {
    return `fontfile='${escapeDrawtextFilterValue(resolved.value)}':`;
  }
  if (resolved.kind === "font" && resolved.value) {
    return `font='${escapeDrawtextFilterValue(resolved.value)}':`;
  }
  return "";
}

// --- Validated streaming download ---

export interface DownloadToFileOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  lookupImpl?: DnsLookupFn;
}

export function maxDownloadBytes(): number {
  const raw = Number(process.env.VIDEO_DOWNLOAD_MAX_BYTES || "");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_DOWNLOAD_BYTES;
}

export async function downloadUrlToFile(
  url: string,
  outputPath: string,
  options: DownloadToFileOptions = {}
): Promise<void> {
  const safeUrl = await assertSafeDownloadUrl(url, options.lookupImpl);
  const timeoutMs = options.timeoutMs ?? DOWNLOAD_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? maxDownloadBytes();
  const maxRedirects = options.maxRedirects ?? MAX_DOWNLOAD_REDIRECTS;

  const writer = fs.createWriteStream(outputPath);
  let response: any;
  try {
    response = await axios({
      url: safeUrl.toString(),
      method: "GET",
      responseType: "stream",
      timeout: timeoutMs,
      maxContentLength: maxBytes,
      maxBodyLength: maxBytes,
      maxRedirects,
    });
  } catch (err) {
    writer.destroy();
    throw err;
  }

  const contentLength = Number(response.headers?.["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    writer.destroy();
    throw new Error(
      `Refusing download: content-length ${contentLength} exceeds limit of ${maxBytes} bytes`
    );
  }

  return new Promise<void>((resolve, reject) => {
    let received = 0;
    let settled = false;
    const fail = (err: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        response.data.destroy();
      } catch {
        // Ignore destroy errors; the rejection below carries the failure.
      }
      writer.destroy();
      reject(err);
    };
    response.data.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (!settled && received > maxBytes) {
        fail(new Error(`Download exceeds size limit of ${maxBytes} bytes`));
      }
    });
    response.data.on("error", (err: Error) => {
      fail(err);
    });
    writer.on("finish", () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    });
    writer.on("error", (err: Error) => {
      fail(err);
    });
    response.data.pipe(writer);
  });
}
