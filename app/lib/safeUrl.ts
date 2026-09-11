// Shared server-side URL safety gate for anything the server fetches.
// Pure module: no node imports, so it stays safe on any runtime.
// Blocks non-http(s) schemes and literal private/internal hosts.
// Internal storage URIs (r2://, gs://) pass through: they are never
// fetched over HTTP and other flows depend on them.
// Note: this is a literal check only. A hostile domain that resolves to a
// public IP today and an internal one tomorrow (DNS rebinding) is not
// caught here. Delivery paths re-resolve before sending (see deliveryCheck).
const STORAGE_SCHEMES = new Set(["r2:", "gs:"]);

function parseIpv4Numbers(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length < 1 || parts.length > 4) {
    return null;
  }
  const nums: number[] = [];
  for (const part of parts) {
    if (/^0x[0-9a-f]+$/i.test(part)) {
      nums.push(parseInt(part, 16));
    } else if (/^0[0-9]+$/.test(part)) {
      if (/^0[0-7]+$/.test(part)) {
        nums.push(parseInt(part, 8));
      } else {
        return null;
      }
    } else if (/^\d+$/.test(part)) {
      nums.push(parseInt(part, 10));
    } else {
      return null;
    }
  }
  return nums;
}

function expandIpv4(nums: number[]): number[] | null {
  if (nums.length === 1) {
    const n = nums[0];
    if (n < 0 || n > 0xffffffff) {
      return null;
    }
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  }
  if (nums.length === 2) {
    const [a, b] = nums;
    if (a < 0 || a > 255 || b < 0 || b > 0xffffff) {
      return null;
    }
    return [a, (b >>> 16) & 255, (b >>> 8) & 255, b & 255];
  }
  if (nums.length === 3) {
    const [a, b, c] = nums;
    if (a < 0 || a > 255 || b < 0 || b > 255 || c < 0 || c > 0xffff) {
      return null;
    }
    return [a, b, (c >>> 8) & 255, c & 255];
  }
  if (nums.some((n) => n < 0 || n > 255)) {
    return null;
  }
  return nums;
}

function isPrivateV4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 10) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 127) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 0) {
    return true;
  }
  return false;
}

function isPrivateV6(bare: string): boolean {
  if (bare === "::1") {
    return true;
  }
  const segments = bare.split(":");
  const first = segments[0] === "" ? "0" : segments[0];
  const firstValue = parseInt(first, 16);
  if (Number.isFinite(firstValue)) {
    if (firstValue >= 0xfc00 && firstValue <= 0xfdff) {
      return true;
    }
    if (firstValue >= 0xfe80 && firstValue <= 0xfebf) {
      return true;
    }
  }
  const embedded = bare.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (embedded) {
    const nums = parseIpv4Numbers(embedded[1]);
    const octets = nums ? expandIpv4(nums) : null;
    if (!octets || isPrivateV4(octets)) {
      return true;
    }
  }
  return false;
}

// True when a hostname must never be fetched by the server.
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.+$/, "");
  if (!host || host === "localhost") {
    return true;
  }
  const bare = host.replace(/^\[|\]$/g, "");
  if (bare.includes(":")) {
    return isPrivateV6(bare);
  }
  if (/^[0-9a-fx.]+$/i.test(bare)) {
    const nums = parseIpv4Numbers(bare);
    const octets = nums ? expandIpv4(nums) : null;
    if (!octets || isPrivateV4(octets)) {
      return true;
    }
    return false;
  }
  if (!bare.includes(".")) {
    return true;
  }
  return false;
}

// True when the server may fetch or store this URL.
export function isSafeUrl(raw: unknown): boolean {
  if (typeof raw !== "string") {
    return false;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  const scheme = parsed.protocol.toLowerCase();
  if (STORAGE_SCHEMES.has(scheme)) {
    return true;
  }
  if (scheme !== "http:" && scheme !== "https:") {
    return false;
  }
  return !isPrivateHost(parsed.hostname);
}
