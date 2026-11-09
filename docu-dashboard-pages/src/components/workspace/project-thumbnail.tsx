import { BarChart3, ChevronDown, Play, Plus, Search, MoreHorizontal } from "lucide-react";
import presenter from "@/assets/presenter.jpg";
export function ProductScreen({ board = false }: { board?: boolean }) {
  return (
    <div
      className={`product-screen ${board ? "board-screen" : ""}`}
      aria-label={board ? "Sample task board" : "Sample product dashboard"}
    >
      <div className="mock-sidebar">
        <span className="mock-brand">◈ {board ? "Layers" : "Acme"}</span>
        <div className="mock-search">
          <Search size={8} /> Search
        </div>
        {["Overview", "Projects", "Analytics", "Team"].map((item, i) => (
          <div key={item} className={i === 0 ? "mock-nav active" : "mock-nav"}>
            <span className="mock-square" />
            {item}
          </div>
        ))}
        <div className="mock-bottom">A &nbsp; Alex Morgan</div>
      </div>
      <div className="mock-body">
        <div className="mock-header">
          {board ? "Project overview" : "Workspace overview"}
          <MoreHorizontal size={12} />
        </div>
        <div className="mock-subheader">
          {board ? "Make room for your next big idea." : "Welcome back, Alex"}
          <span>
            <ChevronDown size={8} /> This month
          </span>
        </div>
        {board ? (
          <div className="mock-columns">
            {["To do", "In progress", "Complete"].map((s, i) => (
              <div key={s}>
                <b>
                  {s} <Plus size={8} />
                </b>
                {[1, 2, 3].slice(0, i === 2 ? 2 : 3).map((n) => (
                  <div className="mock-task" key={n}>
                    <span className="mock-tag" />{" "}
                    <strong>
                      {["Website refresh", "Research & discovery", "Product launch"][n - 1]}
                    </strong>
                    <p>Review with the team</p>
                    <span className="mock-avatars">A &nbsp; J</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="mock-stats">
              {[
                ["Total revenue", "$24,580"],
                ["Active users", "1,284"],
                ["Conversion", "8.42%"],
              ].map(([l, v]) => (
                <div key={l}>
                  <span>{l}</span>
                  <strong>{v}</strong>
                  <small>↗ 12.8% this month</small>
                </div>
              ))}
            </div>
            <div className="mock-chart">
              <div>
                Revenue overview <BarChart3 size={10} />
              </div>
              <svg viewBox="0 0 400 105" preserveAspectRatio="none" aria-hidden="true">
                <path className="chart-grid" d="M0 20H400M0 50H400M0 80H400" />
                <path
                  className="chart-area"
                  d="M0 85L30 75L65 78L95 54L130 65L170 32L210 48L250 20L290 36L335 12L365 22L400 5V105H0Z"
                />
                <path
                  className="chart-line"
                  d="M0 85L30 75L65 78L95 54L130 65L170 32L210 48L250 20L290 36L335 12L365 22L400 5"
                />
              </svg>
            </div>
            <div className="mock-table">
              <b>Recent activity</b>
              <span>
                Website redesign <i /> In progress
              </span>
              <span>
                Product launch <i /> Completed
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
export function ProjectThumbnail({ type, large = false }: { type: string; large?: boolean }) {
  if (type === "video")
    return (
      <div className={`project-preview video-preview ${large ? "large-preview" : ""}`}>
        <img
          src={presenter}
          alt="Sample webinar presenter"
          width={1024}
          height={768}
          loading="lazy"
        />
        <span className="video-caption">The next big thing starts here.</span>
        <span className="duration">01:24</span>
        <span className="preview-play">
          <Play size={19} fill="currentColor" />
        </span>
      </div>
    );
  return (
    <div
      className={`project-preview ${type === "board" ? "board-preview" : "demo-preview"} ${large ? "large-preview" : ""}`}
    >
      <ProductScreen board={type === "board"} />
      <span className="demo-hotspot" />
      <span className="demo-callout">
        {type === "board" ? "Bring your team together" : "Your workspace, at a glance"}
        <span>→</span>
      </span>
    </div>
  );
}
