export function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(3, Math.floor(Math.log(Math.max(1, bytes)) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index > 0 ? 1 : 0)} ${units[index]}`;
}

export function storageBytes(files: { url: string; size: number }[]) {
  const unique = new Map<string, number>();
  for (const file of files) unique.set(file.url, Math.max(unique.get(file.url) || 0, file.size));
  return [...unique.values()].reduce((sum, size) => sum + size, 0);
}

export function usagePercent(used: number, budget: number) {
  return Math.min(100, Math.max(0, budget > 0 ? (used / budget) * 100 : 0));
}