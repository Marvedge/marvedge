// Validates and normalizes customer-supplied custom domains before they are
// stored or handed to Cloudflare. Pure module: no Node-only imports.
//
// Only public DNS hostnames are accepted. IP literals, internal/reserved
// names, schemes, ports, and paths are rejected so the stored value can never
// point the hub at an internal service.
import { isPrivateHost } from "@/app/lib/safeUrl";

const MAX_HOSTNAME_LENGTH = 253;
const MAX_LABEL_LENGTH = 63;
const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const RESERVED_NAMES = new Set([
  "localhost",
  "local",
  "internal",
  "intranet",
  "lan",
  "home",
  "corp",
]);

const RESERVED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".corp",
  ".test",
  ".invalid",
  ".example",
  ".onion",
  ".arpa",
];

const GENERIC_HOSTNAME_ERROR = "Custom domain must be a public hostname like example.com";

export type CustomDomainResult = { ok: true; value: string | null } | { ok: false; error: string };

function isReservedName(host: string): boolean {
  if (RESERVED_NAMES.has(host)) {
    return true;
  }
  return RESERVED_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix));
}

export function normalizeCustomDomain(raw: unknown): CustomDomainResult {
  if (raw === null || raw === undefined) {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: "Custom domain must be a string" };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }

  let host = trimmed.toLowerCase();
  if (host.endsWith(".")) {
    host = host.slice(0, -1);
  }

  if (host.length > MAX_HOSTNAME_LENGTH) {
    return {
      ok: false,
      error: "Custom domain must be 253 characters or fewer",
    };
  }

  // Schemes, ports, paths, credentials, whitespace, and IPv6 brackets are all
  // invalid in a bare hostname.
  if (/[:\/?#@\\\s[\]]/.test(host)) {
    return { ok: false, error: GENERIC_HOSTNAME_ERROR };
  }

  if (isReservedName(host)) {
    return {
      ok: false,
      error: "Private or reserved hostnames are not allowed as a custom domain",
    };
  }

  const labels = host.split(".");
  if (labels.length < 2) {
    return {
      ok: false,
      error: "Custom domain must include a top-level domain, like example.com",
    };
  }

  for (const label of labels) {
    if (!label) {
      return { ok: false, error: "Custom domain cannot contain empty labels" };
    }
    if (label.length > MAX_LABEL_LENGTH) {
      return {
        ok: false,
        error: "Each part of a custom domain must be 63 characters or fewer",
      };
    }
    if (!LABEL_PATTERN.test(label)) {
      return {
        ok: false,
        error:
          "Custom domain may only contain letters, numbers, and hyphens, and cannot start or end a part with a hyphen",
      };
    }
  }

  // Every IPv4 literal is rejected, not just private ranges. A final label made
  // only of digits can only be an IP-style address or an invalid TLD.
  const finalLabel = labels[labels.length - 1];
  if (/^\d+$/.test(finalLabel)) {
    return { ok: false, error: "IP addresses are not allowed as a custom domain" };
  }

  // Defence in depth: catches hex/octal/short IPv4 forms and internal names.
  if (isPrivateHost(host)) {
    return {
      ok: false,
      error: "Private or reserved hostnames are not allowed as a custom domain",
    };
  }

  return { ok: true, value: host };
}

export function isValidCustomDomain(raw: unknown): boolean {
  return normalizeCustomDomain(raw).ok;
}
