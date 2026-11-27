// Shared server-side URL safety gate for anything the server fetches.
// Pure module: no node imports, so it stays safe on any runtime.
// Blocks non-http(s) schemes and literal private/internal hosts.
// Internal storage URIs (r2://, gs://, s3://) pass through: they are never
// fetched over HTTP and other flows depend on them.
// Note: this is a literal check only. A hostile domain that resolves to a
// public IP today and an internal one tomorrow (DNS rebinding) is not
// caught here. Delivery paths re-resolve before sending (see deliveryCheck).
const STORAGE_SCHEMES = new Set(["r2:", "gs:", "s3:"]);

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
  // CGNAT / shared address space (RFC 6598). Never a public fetch target.
  if (a === 100 && b >= 64 && b <= 127) {
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

// Expand a textual IPv6 address into eight 16-bit groups. A trailing
// dotted-quad is folded into its two hex groups so mapped/compatible forms
// can be checked the same way. Null means the text is not parseable.
function expandV6Groups(bare: string): number[] | null {
  let text = bare;
  const embedded = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (embedded) {
    const nums = parseIpv4Numbers(embedded[1]);
    const octets = nums ? expandIpv4(nums) : null;
    if (!octets) {
      return null;
    }
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    text = `${text.slice(0, -embedded[1].length)}${high}:${low}`;
  }

  const marker = text.indexOf("::");
  let groups: string[];
  if (marker === -1) {
    groups = text.split(":");
  } else {
    if (text.indexOf("::", marker + 1) !== -1) {
      return null;
    }
    const left = text.slice(0, marker).split(":").filter(Boolean);
    const right = text
      .slice(marker + 2)
      .split(":")
      .filter(Boolean);
    const zeros = 8 - left.length - right.length;
    if (zeros < 0) {
      return null;
    }
    groups = [...left, ...Array(zeros).fill("0"), ...right];
  }
  if (groups.length !== 8) {
    return null;
  }
  const values = groups.map((group) =>
    /^[0-9a-f]{1,4}$/i.test(group) ? parseInt(group, 16) : Number.NaN
  );
  return values.some((value) => !Number.isFinite(value)) ? null : values;
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

  // Expansion catches the literal forms above misses: the unspecified
  // address (::) and IPv4 addresses written as hex groups, for example
  // ::ffff:7f00:1 == 127.0.0.1.
  const groups = expandV6Groups(bare);
  if (!groups) {
    return false;
  }
  if (groups.every((group) => group === 0)) {
    return true;
  }
  const mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  const compatible = groups.slice(0, 6).every((group) => group === 0);
  if (mapped || compatible) {
    const octets = [
      (groups[6] >>> 8) & 255,
      groups[6] & 255,
      (groups[7] >>> 8) & 255,
      groups[7] & 255,
    ];
    return isPrivateV4(octets);
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
