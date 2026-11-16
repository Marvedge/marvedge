/**
 * Reads and validates the ELEVENLABS_DUBBING_WATERMARK environment variable.
 *
 * - Unset / empty  -> returns `undefined`  (caller omits the parameter; provider default applies)
 * - `"true"`       -> returns `true`
 * - `"false"`      -> returns `false`
 * - Anything else  -> throws a configuration error so the worker fails fast rather than
 *                     silently choosing a behaviour the operator did not intend.
 *
 * This is intentionally restricted to explicit `true`/`false` strings so that
 * typos (e.g. `"yes"`, `"1"`, `"enabled"`) are caught at startup, not silently
 * treated as one value or the other.
 */
export function parseDubbingWatermark(env: NodeJS.ProcessEnv = process.env): boolean | undefined {
  const raw = env.ELEVENLABS_DUBBING_WATERMARK?.trim();

  if (raw === undefined || raw === "") {
    return undefined;
  }

  if (raw === "true") {
    return true;
  }

  if (raw === "false") {
    return false;
  }

  throw new Error(
    `Invalid ELEVENLABS_DUBBING_WATERMARK value: "${raw}". ` +
      'Expected "true", "false", or leave unset to use the provider default.'
  );
}
