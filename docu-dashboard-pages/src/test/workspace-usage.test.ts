import { describe, it, expect } from "vitest";
import { storageBytes, formatBytes, usagePercent } from "@/lib/workspace-usage";
describe("Workspace usage estimates", () => {
  it("counts shared source files only once", () => {
    expect(storageBytes([{ url: "blob:a", size: 1024 }, { url: "blob:a", size: 1024 }, { url: "blob:b", size: 2048 }])).toBe(3072);
  });
  it("formats empty and uploaded storage", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024 ** 2)).toBe("1.0 MB");
  });
  it("caps meters without blocking over-budget activity", () => {
    expect(usagePercent(3, 10)).toBe(30);
    expect(usagePercent(20, 10)).toBe(100);
  });
});