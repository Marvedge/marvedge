import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Eye,
  BarChart3,
  MousePointer2,
  Users,
  Download,
  ArrowUpRight,
  Monitor,
  Smartphone,
  Tablet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { analyticsExamples, analyticsReport } from "@/lib/analytics-sample";
import { downloadFile } from "@/lib/editor-model";
const number = (n: number) => n.toLocaleString("en-US");
const percent = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "—");
export function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [project, setProject] = useState("all");
  const [series, setSeries] = useState<"views" | "completions" | "clicks" | "leads">("views");
  const [hover, setHover] = useState<number | null>(null);
  const report = analyticsReport(days, project);
  const t = report.totals;
  const max = Math.max(1, ...report.daily.map((d) => d[series]));
  const selected = hover === null ? null : report.daily[hover];
  function exportCsv() {
    downloadFile(
      "Sample data only — no real customer activity\nProject,Sample day,Views,Completions,CTA clicks,Leads\n" +
        report.rows
          .map(
            (r) =>
              `${analyticsExamples.find((p) => p.id === r.projectId)?.name},${r.day},${r.views},${r.completions},${r.clicks},${r.leads}`,
          )
          .join("\n"),
      "marvedge-sample-analytics.csv",
      "text/csv",
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">EVERY INTERACTION TELLS A STORY</div>
          <h1>Analytics</h1>
          <p>Understand what resonates, from the first view to the next step.</p>
        </div>
        <Button variant="outline" onClick={exportCsv}>
          <Download size={15} />
          Export sample CSV
        </Button>
      </div>
      <div className="filter-bar">
        <select
          aria-label="Analytics date range"
          value={days}
          onChange={(e) => {
            setDays(Number(e.target.value));
            setHover(null);
          }}
        >
          <option value={30}>Last 30 days</option>
          <option value={7}>Last 7 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <select
          aria-label="Analytics project"
          value={project}
          onChange={(e) => {
            setProject(e.target.value);
            setHover(null);
          }}
        >
          <option value="all">All sample projects</option>
          {analyticsExamples.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="sample-label">Sample data · Tracking not connected</span>
      </div>
      <div className="metric-grid">
        {[
          { title: "Views / starts", value: number(t.views), icon: Eye, desc: "Experience starts" },
          {
            title: "Completion rate",
            value: percent(t.completions, t.views),
            icon: BarChart3,
            desc: `${number(t.completions)} completed experiences`,
          },
          {
            title: "CTA clicks",
            value: number(t.clicks),
            icon: MousePointer2,
            desc: `${percent(t.clicks, t.views)} click-through rate`,
          },
          {
            title: "Lead submissions",
            value: number(t.leads),
            icon: Users,
            desc: `${percent(t.leads, t.views)} view-to-lead rate`,
          },
        ].map((m) => (
          <div className="metric-item" key={m.title}>
            <div>
              <span>{m.title}</span>
              <m.icon size={18} />
            </div>
            <strong>{m.value}</strong>
            <small>{m.desc}</small>
          </div>
        ))}
      </div>
      <section className="analytics-chart populated-chart">
        <div className="section-heading">
          <h2>Engagement over time</h2>
          <span>
            {selected
              ? `Sample day ${selected.day} · ${number(selected[series])} ${series}`
              : `Last ${days} sample days`}
          </span>
        </div>
        <div className="analytics-series">
          {(["views", "completions", "clicks", "leads"] as const).map((s) => (
            <Button
              key={s}
              variant={series === s ? "secondary" : "ghost"}
              onClick={() => setSeries(s)}
            >
              {s === "clicks" ? "CTA clicks" : s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>
        <div className="analytics-plot">
          <div className="analytics-axis">
            <span>{number(max)}</span>
            <span>{number(Math.round(max / 2))}</span>
            <span>0</span>
          </div>
          <div
            className={`analytics-bars series-${series}`}
            style={{ "--bar-count": days } as React.CSSProperties}
          >
            {report.daily.map((d, i) => (
              <Button
                variant="ghost"
                className="analytics-bar"
                key={d.day}
                aria-label={`Sample day ${d.day}: ${d[series]} ${series}`}
                title={`Sample day ${d.day}: ${number(d[series])} ${series}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onClick={() => setHover(i)}
                style={
                  {
                    "--bar-height": `${Math.max(1, (d[series] / max) * 100)}%`,
                  } as React.CSSProperties
                }
              >
                <span />
              </Button>
            ))}
          </div>
        </div>
        <div className="analytics-xaxis">
          <span>Day {91 - days}</span>
          <span>Day {Math.round(91 - days / 2)}</span>
          <span>Day 90</span>
        </div>
      </section>
      <section className="data-section">
        <div className="section-heading">
          <h2>Conversion funnel</h2>
          <span>Share of experience starts</span>
        </div>
        <div className="funnel populated-funnel">
          {[
            { name: "Experience started", value: t.views },
            { name: "Experience completed", value: t.completions },
            { name: "CTA clicked", value: t.clicks },
            { name: "Lead submitted", value: t.leads },
          ].map((s, i) => (
            <div key={s.name}>
              <span>{i + 1}</span>
              <b>{s.name}</b>
              <strong>{number(s.value)}</strong>
              <small>{percent(s.value, t.views)}</small>
              <div className={`funnel-meter funnel-step-${i}`}>
                <i style={{ width: percent(s.value, t.views) }} />
              </div>
            </div>
          ))}
        </div>
      </section>
      <div className="analytics-detail-grid">
        <section className="data-section">
          <div className="section-heading">
            <h2>Project performance</h2>
            <span>{report.projects.length} sample projects</span>
          </div>
          <div className="analytics-table-scroll">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Views</th>
                  <th>Completed</th>
                  <th>CTA clicks</th>
                  <th>Leads</th>
                </tr>
              </thead>
              <tbody>
                {report.projects.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to="/editor/$projectId" params={{ projectId: p.id }}>
                        {p.name}
                        <ArrowUpRight size={12} />
                      </Link>
                      <small>Sample project</small>
                    </td>
                    <td>{number(p.views)}</td>
                    <td>{percent(p.completions, p.views)}</td>
                    <td>{number(p.clicks)}</td>
                    <td>{number(p.leads)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="data-section">
          <h2>Audience devices</h2>
          {[
            { name: "Desktop", share: 68, icon: Monitor },
            { name: "Mobile", share: 26, icon: Smartphone },
            { name: "Tablet", share: 6, icon: Tablet },
          ].map((d) => (
            <div className="device-breakdown" key={d.name}>
              <d.icon size={17} />
              <span>
                {d.name}
                <small>{number(Math.round((t.views * d.share) / 100))} sample views</small>
              </span>
              <b>{d.share}%</b>
              <div>
                <i style={{ width: `${d.share}%` }} />
              </div>
            </div>
          ))}
        </section>
      </div>
      <p className="preview-note">
        Illustrative data only. Filters and downloads use sample activity; no real visitors, clicks,
        or leads are being collected.
      </p>
    </>
  );
}
