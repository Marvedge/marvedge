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
