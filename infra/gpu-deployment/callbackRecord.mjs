export function buildCallbackRecord(parsed, timestamp = Date.now()) {
  return {
    status: parsed.status,
    exportedUrl: parsed.exportedUrl,
    fallback: parsed.fallback || false,
    fallbackReason: parsed.fallbackReason || null,
    timestamp,
  };
}
