import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  MousePointer2,
  Film,
  Upload,
  Check,
  Circle,
  ChevronRight,
  Sparkles,
  Clock3,
  FolderOpen,
  Video,
  Link2,
  Wand2,
  Bot,
  Eye,
  Target,
  Users,
} from "lucide-react";
import { UsageBars } from "./usage-bars";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace";
import { ProductScreen } from "./project-thumbnail";
import { ProjectCard } from "./project-card";
import presenter from "@/assets/presenter.jpg";
export function HomePage() {
  const { projects, profile } = useWorkspace();
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="live-dot" /> YOUR CREATIVE WORKSPACE
          </div>
          <h1>
            Welcome back, {profile.name.split(" ")[0]} <span className="wave">✳</span>
          </h1>
          <p>Big ideas deserve to be seen. Let’s bring yours to life.</p>
        </div>
        <Button asChild>
          <Link to="/create">
            <Plus /> Create new
          </Link>
        </Button>
      </div>
      <section className="quick-create" aria-label="Quick create">
        <div className="section-heading">
          <h2>Quick create</h2>
          <span>Pick a starting point — every option opens in the editor.</span>
        </div>
        <div className="quick-create-grid">
          <Link to="/record" className="quick-create-card"><Video size={18} /><b>Record</b><span>Screen, camera or both</span></Link>
          <Link to="/create" search={{ type: "video", method: "upload" }} className="quick-create-card"><Upload size={18} /><b>Upload</b><span>Bring an existing video</span></Link>
          <Link to="/create" search={{ type: "demo", method: "url" }} className="quick-create-card"><Link2 size={18} /><b>From URL</b><span>Capture a product page</span></Link>
          <Link to="/create" search={{ type: "demo", method: "prompt" }} className="quick-create-card"><Wand2 size={18} /><b>From prompt</b><span>Describe what to make</span></Link>
          <Link to="/ai-studio" className="quick-create-card"><Bot size={18} /><b>AI Agent</b><span>Plan it with AI Studio</span></Link>
        </div>
      </section>
      <section className="creation-section">
        <div className="section-heading">
          <h2>What will you create today?</h2>
          <span>From a first impression to a lasting connection.</span>
        </div>
        <div className="creation-grid">
          <Link to="/create" search={{ type: "demo" }} className="creation-card demo-creation">
            <div className="creation-copy">
              <span className="creation-icon">
                <MousePointer2 size={22} />
              </span>
              <span className="tiny-label">SHOW, DON’T JUST TELL</span>
              <h2>Interactive product demo</h2>
              <p>
                Turn your product into a hands-on
                <br className="desktop-only" /> experience worth exploring.
              </p>
              <span className="creation-cta">
                Create a demo <ArrowRight size={16} />
              </span>
            </div>
            <div className="creation-art demo-art">
              <div className="art-browser">
                <div className="browser-dots">
                  <i />
                  <i />
                  <i />
                  <span>acme.app</span>
                </div>
                <ProductScreen />
              </div>
              <span className="art-tooltip">
                Let’s take a quick tour <ArrowRight size={11} />
              </span>
              <span className="art-pointer">
                <MousePointer2 size={24} fill="currentColor" />
              </span>
            </div>
          </Link>
          <Link to="/create" search={{ type: "video" }} className="creation-card video-creation">
            <div className="creation-copy">
              <span className="creation-icon">
                <Film size={22} />
              </span>
              <span className="tiny-label">LONG CONTENT. BIG POTENTIAL.</span>
              <h2>AI-powered short videos</h2>
              <p>
                Turn long recordings into short,
                <br className="desktop-only" /> standout moments.
              </p>
              <span className="creation-cta">
                Repurpose a video <ArrowRight size={16} />
              </span>
            </div>
            <div className="creation-art video-art">
              <div className="video-strip strip-back">
                <img src={presenter} alt="Webinar sample" width={1024} height={768} />
              </div>
              <div className="video-strip strip-front">
                <img src={presenter} alt="Vertical video example" width={1024} height={768} />
                <span>
                  BIG IDEAS.
                  <br />
                  BITE-SIZED.
                </span>
                <div className="mini-wave">▂ ▅ ▃ ▆ ▂ ▅ ▇ ▃ ▄ ▂</div>
              </div>
              <span className="ai-spark">
                <Sparkles size={16} /> AI magic
              </span>
            </div>
          </Link>
        </div>
      </section>
      <section className="recent-section">
        <div className="section-heading">
          <div className="flex items-center gap-3">
            <h2>Pick up where you left off</h2>
            <span className="sample-label">Sample projects</span>
          </div>
          <Button variant="link" asChild>
            <Link to="/projects">
              View all projects <ArrowRight />
            </Link>
          </Button>
        </div>
        <div className="projects-grid">
          {projects.slice(0, 3).map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
        {projects.length === 0 && (
          <div className="empty-state">
            <FolderOpen />
            <h3>A fresh canvas awaits</h3>
            <Button asChild>
              <Link to="/create">Create your first project</Link>
            </Button>
          </div>
        )}
      </section>
      <section className="performance-section">
        <div className="section-heading">
          <div className="flex items-center gap-3">
            <h2>Performance snapshot</h2>
            <span className="sample-label">Sample activity</span>
          </div>
          <Button variant="link" asChild>
            <Link to="/analytics">Open analytics <ArrowRight /></Link>
          </Button>
        </div>
        <div className="performance-grid">
          {[
            { icon: Eye, label: "Views", value: "1,284" },
            { icon: Target, label: "Completion", value: "62%" },
            { icon: Users, label: "Leads", value: "37" },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="performance-card">
              <Icon size={16} />
              <span>{label}</span>
              <b>{value}</b>
            </div>
          ))}
        </div>
      </section>
      <div className="home-bottom">
        <section className="getting-started">
          <div className="section-heading">
            <h2>A great start, one step at a time</h2>
            <span className="progress-count">1 of 4 complete</span>
          </div>
          <div className="onboarding-progress">
            <span />
          </div>
          <div className="checklist">
            {[
              { text: "Make yourself at home", done: true, path: "/" },
              { text: "Create your first project", done: false, path: "/create" },
              { text: "Make it your own", done: false, path: "/brand-kit" },
              { text: "Preview and share your story", done: false, path: "/projects" },
            ].map((item, i) => (
              <Link
                key={item.text}
                to={item.path as "/" | "/create" | "/brand-kit" | "/projects"}
                className={item.done ? "checklist-item completed" : "checklist-item"}
              >
                {item.done ? (
                  <span className="check-circle">
                    <Check size={11} />
                  </span>
                ) : (
                  <span className="step-circle">{i + 1}</span>
                )}
                <span>{item.text}</span>
                {!item.done && <ChevronRight size={14} />}
              </Link>
            ))}
          </div>
        </section>
        <section className="activity-section">
          <div className="section-heading">
            <h2>Workspace activity</h2>
            <Clock3 size={16} className="text-muted-foreground" />
          </div>
          <div className="activity-item">
            <span className="activity-icon">
              <FolderOpen size={17} />
            </span>
            <div>
              <b>Your workspace is ready</b>
              <p>Explore your sample projects or start something new.</p>
              <small>Preview workspace</small>
            </div>
          </div>
          <div className="home-usage"><UsageBars /></div>
          <Link to="/help" className="resource-link">
            <span className="resource-icon">
              <Sparkles size={19} />
            </span>
            <div>
              <b>A little inspiration goes a long way.</b>
              <p>Explore the getting started guide</p>
            </div>
            <ArrowUpRight size={18} />
          </Link>
        </section>
      </div>
      <div className="preview-note">
        <Circle size={11} /> You’re exploring a preview workspace. Projects and changes are kept for
        this session only.
      </div>
    </>
  );
}
