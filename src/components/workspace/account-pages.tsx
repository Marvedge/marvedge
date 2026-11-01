import { useEffect, useState } from "react";
import { useAccount } from "@/lib/account";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  Eye,
  MousePointer2,
  Users,
  Check,
  Plus,
  Upload,
  Palette,
  ArrowUpRight,
  Search,
  BookOpen,
  Video,
  CreditCard,
  Plug,
  Calendar,
  Cloud,
  Mail,
  ChevronRight,
  CircleHelp,
  Bell,
  Shield,
  User,
  Building2,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace";
import { UsageBars } from "./usage-bars";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
export function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}
export { AnalyticsPage } from "./analytics";
export function BrandPage() {
  const { brand, setBrand } = useWorkspace();
  const [color, setColor] = useState(brand.color);
  const [font, setFont] = useState(brand.font);
  const [logo, setLogo] = useState("");
  const [defaults, setDefaults] = useState(true);
  const [saved, setSaved] = useState(false);
  return (
    <>
      <PageHeading
        eyebrow="UNMISTAKABLY YOURS"
        title="Brand Kit"
        description="Keep every demo, caption, and call to action looking like you."
      />
      <div className="brand-layout">
        <section className="form-section">
          <h2>Brand identity</h2>
          <label className="field-label">
            Logo
            <label className="logo-upload">
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setLogo(URL.createObjectURL(f));
                }}
              />
              {logo ? (
                <img src={logo} alt="Uploaded brand logo" />
              ) : (
                <>
                  <Upload size={24} />
                  <span>Upload your logo</span>
                  <small>PNG, JPG, or SVG · session only</small>
                </>
              )}
            </label>
          </label>
          {logo && (
            <Button variant="ghost" onClick={() => setLogo("")}>
              Remove logo
            </Button>
          )}
          <label className="field-label">
            Brand colors
            <div className="color-swatches">
              {["purple", "lavender", "green", "coral", "charcoal"].map((c) => (
                <Button
                  variant="ghost"
                  aria-label={`Choose ${c}`}
                  aria-pressed={color === c}
                  key={c}
                  className={`swatch swatch-${c} ${color === c ? "swatch-selected" : ""}`}
                  onClick={() => {
                    setColor(c);
                    setSaved(false);
                  }}
                >
                  {color === c && <Check size={17} />}
                </Button>
              ))}
            </div>
          </label>
          <label className="field-label">
            Typography
            <select
              value={font}
              onChange={(e) => {
                setFont(e.target.value);
                setSaved(false);
              }}
            >
              <option>DM Sans</option>
              <option>Arial</option>
              <option>Georgia</option>
            </select>
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={defaults}
              onChange={(e) => setDefaults(e.target.checked)}
            />
            Use as the default for new projects
          </label>
          <div className="info-note">
            Saved styles stay in this session. Existing projects are not overwritten.
          </div>
          <Button
            onClick={() => {
              setBrand({ color, font });
              setSaved(true);
            }}
          >
            <Check />
            Save brand kit
          </Button>
          {saved && (
            <p className="success-message" role="status">
              Brand kit saved for this session.
            </p>
          )}
        </section>
        <section
          className={`brand-preview brand-color-${color} brand-font-${font === "Georgia" ? "serif" : font === "Arial" ? "arial" : "sans"}`}
        >
          <span className="tiny-label">STYLE PREVIEW</span>
          <div className="brand-preview-mark">
            {logo ? <img src={logo} alt="Brand logo preview" /> : <Palette size={36} />}
          </div>
          <h2>
            A story that
            <br />
            looks like you.
          </h2>
          <p>
            Every detail. Every interaction.
            <br />
            One unmistakable identity.
          </p>
          <span className="brand-cta-preview">
            Explore the demo <ArrowUpRight size={16} />
          </span>
          <div className="brand-caption-preview">YOUR NEXT BIG IDEA STARTS HERE</div>
        </section>
      </div>
    </>
  );
}
const services = [
  {
    name: "HubSpot",
    category: "CRM",
    symbol: "H",
    color: "coral",
    description: "Bring captured leads into your CRM.",
  },
  {
    name: "Salesforce",
    category: "CRM",
    symbol: "S",
    color: "sky",
    description: "Connect experiences to your sales pipeline.",
  },
  {
    name: "Calendly",
    category: "Scheduling",
    symbol: "C",
    color: "sky",
    description: "Make the next conversation easy to book.",
  },
  {
    name: "Google Analytics",
    category: "Analytics",
    symbol: "G",
    color: "amber",
    description: "Measure engagement alongside your website.",
  },
  {
    name: "Google Drive",
    category: "Storage",
    symbol: "△",
    color: "green",
    description: "Bring your recordings into one workspace.",
  },
  {
    name: "Zapier",
    category: "Automation",
    symbol: "✳",
    color: "coral",
    description: "Connect your workflow with other tools.",
  },
];
export function IntegrationsPage() {
  const [category, setCategory] = useState("All");
  const [service, setService] = useState("");
  return (
    <>
      <PageHeading
        eyebrow="BETTER TOGETHER"
        title="Integrations"
        description="Bring your favorite tools into your creative workflow."
      />
      <div className="page-tabs">
        {["All", "CRM", "Scheduling", "Analytics", "Storage", "Automation"].map((c) => (
          <Button
            variant={category === c ? "secondary" : "ghost"}
            key={c}
            onClick={() => setCategory(c)}
          >
            {c}
          </Button>
        ))}
      </div>
      <div className="integration-grid">
        {services
          .filter((s) => category === "All" || s.category === category)
          .map((s) => (
            <article className="integration-card" key={s.name}>
              <div className="integration-top">
                <span className={`service-logo service-${s.color}`}>{s.symbol}</span>
                <span className="sample-label">Planned</span>
              </div>
              <h3>{s.name}</h3>
              <span className="integration-category">{s.category}</span>
              <p>{s.description}</p>
              <Button variant="outline" onClick={() => setService(s.name)}>
                View details <ArrowUpRight />
              </Button>
            </article>
          ))}
      </div>
      <div className="info-note">
        These are planned integration options, not active connections. No account data or leads are
        shared.
      </div>
      <Dialog
        open={!!service}
        onOpenChange={(v) => {
          if (!v) setService("");
        }}
      >
        <DialogContent>
          <DialogTitle>{service} integration</DialogTitle>
          <DialogDescription>
            This service is not connected in the preview workspace.
          </DialogDescription>
          <p>
            Account linking, permission review, field mapping, and connection testing need to be
            implemented before this integration can be enabled.
          </p>
          <Button variant="outline" onClick={() => setService("")}>
            Got it
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function SubscriptionPage() {
  return (
    <>
      <PageHeading
        eyebrow="ROOM FOR WHAT’S NEXT"
        title="Subscription & usage"
        description="A clear view of your plan, your usage, and your billing."
      />
      <section className="subscription-banner">
        <div>
          <span className="sample-label">Preview workspace</span>
          <h2>Your ideas have room to grow.</h2>
          <p>No paid subscription or billing account is connected.</p>
        </div>
        <CreditCard size={48} />
      </section>
      <div className="billing-columns">
        <section className="data-section">
          <h2>Current plan</h2>
          <div className="review-list">
            <div>
              <span>Plan</span>
              <b>Not configured</b>
            </div>
            <div>
              <span>Billing interval</span>
              <b>—</b>
            </div>
            <div>
              <span>Renewal date</span>
              <b>—</b>
            </div>
            <div>
              <span>Payment method</span>
              <b>Not connected</b>
            </div>
          </div>
          <Button variant="outline" disabled>
            Manage subscription
          </Button>
        </section>
        <section className="data-section">
          <h2>Workspace usage</h2>
          <UsageBars detailed />
        </section>
      </div>
      <section className="data-section">
        <div className="section-heading">
          <h2>Invoice history</h2>
          <span>0 invoices</span>
        </div>
        <div className="empty-state compact">
          <CreditCard size={28} />
          <h3>No invoices yet</h3>
          <p>Billing history will appear after a billing service is connected.</p>
        </div>
      </section>
    </>
  );
}
const articles = [
  {
    title: "Create your first interactive demo",
    category: "Getting started",
    icon: MousePointer2,
    text: "Open Create, choose Interactive product demo, and name your project. Add a product URL or upload a recording and confirm your content permissions. Review the details, then open the draft editor. URL capture is planned; sample screens are used in drafts.",
  },
  {
    title: "Upload a recording",
    category: "Video & uploads",
    icon: Video,
    text: "Choose Short-form video on the Create page. Select an MP4, WebM, or MOV recording, set the target aspect ratio and clip length, then review your draft. Uploaded videos can be played in the editor during this session. AI repurposing is not connected.",
  },
  {
    title: "Make your demo your own",
    category: "Editing",
    icon: Palette,
    text: "Use the editor step list to select, add, reorder, duplicate, or delete steps. The inspector lets you edit the selected step name and callout. Undo and redo apply to these step edits. Use Preview to step through the audience experience.",
  },
  {
    title: "Preview, share, and export",
    category: "Publishing",
    icon: ArrowUpRight,
    text: "Open Preview in the editor to review your screens and messages. Share & export contains a pre-publish checklist and a draft-settings download. Public links, embedding, and rendered video export are planned and will not run in the preview.",
  },
  {
    title: "Understand your analytics",
    category: "Analytics",
    icon: BarChart3,
    text: "Analytics shows unavailable data as a dash. Real views, completions, CTA clicks, and leads will only appear after event collection is connected. Sample project visuals are not customer performance data.",
  },
  {
    title: "Manage your workspace",
    category: "Account & billing",
    icon: Building2,
    text: "Settings lets you update your saved account name and session workspace preferences. Brand Kit previews your styles. Sign-in is connected; billing and publishing are not connected.",
  },
];
export function HelpPage() {
  const [search, setSearch] = useState("");
  const [article, setArticle] = useState("");
  const [support, setSupport] = useState(false);
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState(false);
  function download() {
    const blob = new Blob([message], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "marvedge-support-request.txt";
    a.click();
    URL.revokeObjectURL(a.href);
    setSupport(false);
  }
  return (
    <>
      <PageHeading
        eyebrow="A LITTLE HELP, A LONG WAY"
        title="Help Center"
        description="Find an answer, learn something new, and keep your ideas moving."
      />
      <label className="help-search search-field">
        <Search size={21} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="What can we help you with?"
        />
      </label>
      <div className="help-grid">
        {articles
          .filter((a) => (a.title + a.category).toLowerCase().includes(search.toLowerCase()))
          .map((a) => (
            <Button
              variant="outline"
              className="help-article"
              key={a.title}
              onClick={() => {
                setArticle(a.title);
                setFeedback(false);
              }}
            >
              <a.icon size={23} />
              <span>
                <small>{a.category}</small>
                <b>{a.title}</b>
              </span>
              <ChevronRight />
            </Button>
          ))}
      </div>
      <section className="support-band">
        <div>
          <CircleHelp size={28} />
          <h2>Still looking for an answer?</h2>
          <p>Put together a support request with the details that matter.</p>
        </div>
        <Button variant="outline" onClick={() => setSupport(true)}>
          Prepare a support request <Mail />
        </Button>
      </section>
      <Dialog
        open={!!article}
        onOpenChange={(v) => {
          if (!v) setArticle("");
        }}
      >
        <DialogContent>
          <DialogTitle>{article}</DialogTitle>
          <DialogDescription>
            {articles.find((a) => a.title === article)?.category}
          </DialogDescription>
          <p className="article-copy">{articles.find((a) => a.title === article)?.text}</p>
          <div className="flex items-center gap-3">
            <span>Was this helpful?</span>
            <Button variant="outline" onClick={() => setFeedback(true)}>
              {feedback ? (
                <>
                  <Check />
                  Thanks for your feedback
                </>
              ) : (
                "Yes"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={support} onOpenChange={setSupport}>
        <DialogContent>
          <DialogTitle>Prepare a support request</DialogTitle>
          <DialogDescription>
            Support delivery is not connected. Download your request to send through your existing
            support channel.
          </DialogDescription>
          <label className="field-label">
            Topic
            <select>
              <option>Getting started</option>
              <option>Upload issue</option>
              <option>Editing</option>
              <option>Account & billing</option>
            </select>
          </label>
          <label className="field-label">
            Description
            <textarea
              className="form-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what happened..."
            />
          </label>
          <Button disabled={!message.trim()} onClick={download}>
            <Download />
            Download request
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function SettingsPage() {
  const { profile, setProfile } = useWorkspace();
  const { user, profile: accountProfile, refreshProfile } = useAccount();
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [workspace, setWorkspace] = useState(profile.workspace);
  const [tab, setTab] = useState("Profile");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (accountProfile) setName(accountProfile.display_name);
    if (user?.email) setEmail(user.email);
  }, [accountProfile, user]);
  const [notifications, setNotifications] = useState([true, true, false, false]);
  return (
    <>
      <PageHeading
        eyebrow="YOUR WORKSPACE, YOUR WAY"
        title="Settings"
        description="The little details that make this space yours."
      />
      <div className="settings-layout">
        <nav className="settings-nav">
          {[
            { label: "Profile", icon: User },
            { label: "Workspace", icon: Building2 },
            { label: "Notifications", icon: Bell },
            { label: "Security & privacy", icon: Shield },
          ].map((t) => (
            <Button
              variant={tab === t.label ? "secondary" : "ghost"}
              key={t.label}
              onClick={() => {
                setTab(t.label);
                setSaved(false);
              }}
            >
              <t.icon />
              {t.label}
            </Button>
          ))}
        </nav>
        <section className="form-section settings-form">
          <h2>{tab}</h2>
          {tab === "Profile" && (
            <>
              <div className="profile-setting">
                <span className="avatar large-avatar">
                  {name
                    .split(" ")
                    .map((s) => s[0])
                    .join("")
                    .slice(0, 2)}
                </span>
                <span>
                  Personal profile<small>Saved to your account</small>
                </span>
              </div>
              <label className="field-label">
                Full name
                <input
                  className="form-input"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setSaved(false);
                  }}
                />
              </label>
              <label className="field-label">
                Email address
                <input
                  className="form-input"
                  type="email"
                  readOnly
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setSaved(false);
                  }}
                  placeholder="you@company.com"
                />
              </label>
            </>
          )}
          {tab === "Workspace" && (
            <>
              <label className="field-label">
                Workspace name
                <input
                  className="form-input"
                  value={workspace}
                  onChange={(e) => {
                    setWorkspace(e.target.value);
                    setSaved(false);
                  }}
                />
              </label>
              <div className="form-grid">
                <label className="field-label">
                  Timezone
                  <select>
                    <option>Asia/Kolkata</option>
                    <option>UTC</option>
                    <option>America/New_York</option>
                    <option>Europe/London</option>
                  </select>
                </label>
                <label className="field-label">
                  Language
                  <select>
                    <option>English</option>
                    <option>Hindi</option>
                    <option>Spanish</option>
                  </select>
                </label>
              </div>
              <div className="info-note">
                Team invitations and roles are planned. This preview is a single personal workspace.
              </div>
            </>
          )}
          {tab === "Notifications" && (
            <div className="notification-settings">
              {[
                "Processing completed",
                "Processing failed",
                "Product updates",
                "Marketing emails",
              ].map((n, i) => (
                <label key={n}>
                  <span>
                    <b>{n}</b>
                    <small>
                      {i < 2 ? "Updates about your projects." : "Optional news from Marvedge."}
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={notifications[i]}
                    onChange={(e) => {
                      setNotifications((p) => p.map((v, j) => (i === j ? e.target.checked : v)));
                      setSaved(false);
                    }}
                  />
                </label>
              ))}
              <div className="info-note">
                Preferences are session-only; no notifications or emails are sent.
              </div>
            </div>
          )}
          {tab === "Security & privacy" ? (
            <>
              <div className="review-list">
                <div>
                  <span>Sign-in method</span>
                  <b>Email or Google</b>
                </div>
                <div>
                  <span>Active sessions</span>
                  <b>Signed in</b>
                </div>
                <div>
                  <span>Two-factor authentication</span>
                  <b>Planned</b>
                </div>
              </div>
              <div className="info-note">
                Your account and personal profile are saved securely. Project drafts and media remain session-only.
              </div>
              <Button variant="outline" asChild><Link to="/forgot-password">Reset password</Link></Button>
            </>
          ) : (
            <>
              <div className="form-actions">
                <span>{tab === "Profile" ? "Your name is saved to your account." : "Preferences apply to this session only."}</span>
                <Button
                  disabled={saving || !name.trim() || !workspace.trim()}
                  onClick={async () => {
                    setSaving(true); setSaveError("");
                    if (tab === "Profile" && user) {
                      const { error } = await supabase.from("profiles").update({ display_name: name.trim() }).eq("id", user.id);
                      if (error) { setSaveError(error.message); setSaving(false); return; }
                      await refreshProfile();
                    }
                    setProfile({ name, email, workspace });
                    setSaved(true);
                    setSaving(false);
                  }}
                >
                  <Check />
                  Save changes
                </Button>
              </div>
              {saved && (
                <p className="success-message" role="status">
                  {tab === "Profile" ? "Profile saved to your account." : "Changes saved for this session."}
                </p>
              )}
              {saveError && <p className="auth-error" role="alert">{saveError}</p>}
            </>
          )}
        </section>
      </div>
    </>
  );
}
