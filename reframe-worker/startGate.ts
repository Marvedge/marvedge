export async function runAfterReframeStart<T>(
  start: () => Promise<{ ignored?: boolean }>,
  process: () => Promise<T>
): Promise<T | { success: true; skipped: true }> {
  const started = await start();

  // A late delivery can arrive after enqueue cleanup has settled the job.
  if (started.ignored) {
    return { success: true, skipped: true };
  }

  return process();
}
