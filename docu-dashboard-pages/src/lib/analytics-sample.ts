export type AnalyticsRow = {
  projectId: string;
  day: number;
  views: number;
  completions: number;
  clicks: number;
  leads: number;
};
export const analyticsExamples = [
  {
    id: "product-tour",
    name: "Product onboarding tour",
    completion: 0.74,
    click: 0.23,
    lead: 0.065,
    base: 58,
  },
  {
    id: "launch-highlights",
    name: "Launch webinar highlights",
    completion: 0.61,
    click: 0.17,
    lead: 0.041,
    base: 37,
  },
  {
    id: "feature-walkthrough",
    name: "New feature walkthrough",
    completion: 0.82,
    click: 0.29,
    lead: 0.083,
    base: 26,
  },
];
export const sampleAnalytics: AnalyticsRow[] = analyticsExamples.flatMap((p, index) =>
  Array.from({ length: 90 }, (_, i) => {
    const views = Math.round(p.base * (0.7 + i / 180) + ((i * 17 + index * 13) % 29));
    return {
      projectId: p.id,
      day: i + 1,
      views,
      completions: Math.round(views * p.completion),
      clicks: Math.round(views * p.click),
      leads: Math.round(views * p.lead),
    };
  }),
);
export function analyticsReport(days: number, projectId: string) {
  const rows = sampleAnalytics.filter(
    (r) => r.day > 90 - days && (projectId === "all" || r.projectId === projectId),
  );
  const sum = (items: AnalyticsRow[]) =>
    items.reduce(
      (a, r) => ({
        views: a.views + r.views,
        completions: a.completions + r.completions,
        clicks: a.clicks + r.clicks,
        leads: a.leads + r.leads,
      }),
      { views: 0, completions: 0, clicks: 0, leads: 0 },
    );
  return {
    rows,
    totals: sum(rows),
    projects: analyticsExamples
      .filter((p) => projectId === "all" || p.id === projectId)
      .map((p) => ({ ...p, ...sum(rows.filter((r) => r.projectId === p.id)) })),
    daily: Array.from({ length: days }, (_, i) => ({
      day: 91 - days + i,
      ...sum(rows.filter((r) => r.day === 91 - days + i)),
    })),
  };
}

const companies = ["Northwind", "Acme Corp", "Globex", "Initech", "Umbrella", "Stark Labs", "Wayne Ent.", "Hooli"];
export const sampleSessions = Array.from({ length: 16 }, (_, i) => {
  const p = analyticsExamples[i % 3]!;
  const steps = 4 + (i % 5);
  return {
    id: `s${i}`,
    viewer: i % 4 === 0 ? "Anonymous" : `viewer${i + 1}@${companies[i % 8]!.toLowerCase().replace(/[^a-z]/g, "")}.com`,
    company: companies[i % 8]!,
    projectId: p.id,
    project: p.name,
    day: 90 - (i * 5) % 30,
    minutes: 1 + ((i * 7) % 9),
    steps: Math.min(steps, 8),
    totalSteps: 8,
    lead: i % 3 === 0,
  };
});

/** Rule-based insights from a report: best demo, weakest completion, and trend. */
export function analyticsInsights(report: ReturnType<typeof analyticsReport>) {
  const out: string[] = [];
  const ps = report.projects.filter((p) => p.views > 0);
  if (ps.length) {
    const best = [...ps].sort((a, b) => b.leads / b.views - a.leads / a.views)[0]!;
    const weak = [...ps].sort((a, b) => a.completions / a.views - b.completions / b.views)[0]!;
    out.push(`${best.name} converts best at ${((best.leads / best.views) * 100).toFixed(1)}% of views to leads.`);
    if (ps.length > 1) out.push(`${weak.name} has the lowest completion (${((weak.completions / weak.views) * 100).toFixed(0)}%) — try shortening it or adding chapters.`);
  }
  const half = Math.floor(report.daily.length / 2);
  const a = report.daily.slice(0, half).reduce((s, d) => s + d.views, 0);
  const b = report.daily.slice(half).reduce((s, d) => s + d.views, 0);
  if (a > 0) {
    const change = ((b - a) / a) * 100;
    out.push(`Views are ${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(0)}% in the second half of this period.`);
  }
  return out;
}
