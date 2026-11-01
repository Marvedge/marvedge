import { describe, it, expect } from "vitest";
import { analyticsReport } from "@/lib/analytics-sample";
describe("Sample analytics", () => {
  it("filters by date and project", () => {
    const all = analyticsReport(30, "all");
    const filtered = analyticsReport(7, "product-tour");
    expect(all.rows).toHaveLength(90);
    expect(filtered.rows).toHaveLength(7);
    expect(filtered.totals.views).toBeLessThan(all.totals.views);
    expect(filtered.projects).toHaveLength(1);
  });
  it("keeps chart, table and funnel totals consistent", () => {
    const r = analyticsReport(90, "all");
    expect(r.daily.reduce((sum, d) => sum + d.views, 0)).toBe(r.totals.views);
    expect(r.projects.reduce((sum, p) => sum + p.leads, 0)).toBe(r.totals.leads);
    expect(r.totals.leads).toBeLessThan(r.totals.clicks);
    expect(r.totals.clicks).toBeLessThan(r.totals.completions);
  });
});
