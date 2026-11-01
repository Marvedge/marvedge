import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Upload,
  Plus,
  CalendarDays,
  List,
  Image,
  Search,
  Settings2,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Copy,
  Trash2,
  Instagram,
  Linkedin,
  Youtube,
  Facebook,
  Globe,
  Clock,
  KeyRound,
  ShieldCheck,
  Link2,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useWorkspace } from "@/lib/workspace";
import { uploadChannels, validatePost, validateUpload, type UploadPost } from "@/lib/upload-model";
import { downloadFile } from "@/lib/editor-model";
import { ProjectThumbnail } from "./project-thumbnail";
import { toast } from "sonner";

export function ChannelIcon({ channel, size = 17 }: { channel: string; size?: number }) {
  const Icon =
    channel === "Instagram"
      ? Instagram
      : channel === "LinkedIn"
        ? Linkedin
        : channel === "YouTube"
          ? Youtube
          : channel === "Facebook"
            ? Facebook
            : Globe;
  return (
    <span className={`upload-channel channel-${channel.toLowerCase()}`} title={channel}>
      <Icon size={size} />
    </span>
  );
}
function UploadNavigation() {
  return (
    <nav className="upload-navigation">
      <Link to="/uploads" activeOptions={{ exact: true }} activeProps={{ className: "selected" }}>
        <CalendarDays size={17} /> Publishing
      </Link>
      <Link to="/uploads/accounts" activeProps={{ className: "selected" }}>
        <Settings2 size={17} /> Accounts & credentials
      </Link>
    </nav>
  );
}
const newPost = (): UploadPost => ({
  id: crypto.randomUUID(),
  title: "",
  caption: "",
  channels: [],
  status: "Draft",
  scheduledAt: "",
});
export function UploadManagementPage() {
  const {
    uploadPosts: posts,
    setUploadPosts,
    uploadMedia: media,
    setUploadMedia,
    projects,
    trashPost,
    trashMedia,
  } = useWorkspace();
  const [view, setView] = useState("Queue");
  const [status, setStatus] = useState("All posts");
  const [channel, setChannel] = useState("All channels");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<UploadPost | null>(null);
  const [error, setError] = useState("");
  const [month, setMonth] = useState(new Date(2026, 9, 1));
  const fileInput = useRef<HTMLInputElement>(null);
  const filtered = posts.filter(
    (p) =>
      (status === "All posts" || p.status === status) &&
      (channel === "All channels" || p.channels.some((c) => c === channel)) &&
      `${p.title} ${p.caption}`.toLowerCase().includes(search.toLowerCase()),
  );
  function compose(p?: UploadPost) {
    setError("");
    setEditing(p ? { ...p, channels: [...p.channels] } : newPost());
  }
  function save(status: UploadPost["status"]) {
    if (!editing) return;
    const next = { ...editing, status, sample: false };
    const problem = validatePost(next);
    if (problem) {
      setError(problem);
      return;
    }
    setUploadPosts((prev) =>
      prev.some((p) => p.id === next.id)
        ? prev.map((p) => (p.id === next.id ? next : p))
        : [next, ...prev],
    );
    setEditing(null);
    toast.success(
      status === "Planned"
        ? "Added to planning queue. Nothing will publish automatically."
        : "Draft saved in this session",
    );
  }
  async function addFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const problem = validateUpload(file);
      if (problem) {
        toast.error(`${file.name}: ${problem}`);
        continue;
      }
      setUploadMedia((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          name: file.name,
          url: URL.createObjectURL(file),
          kind: file.type.startsWith("image/") ? "image" : "video",
          size: file.size,
        },
      ]);
    }
    setView("Media library");
    if (fileInput.current) fileInput.current.value = "";
  }
  function preview(p: UploadPost) {
    const item = media.find((m) => m.id === p.mediaId);
    const project = projects.find((pr) => pr.id === p.projectId);
    return item ? (
      item.kind === "image" ? (
        <img src={item.url} alt={item.name} />
      ) : (
        <video src={item.url} controls preload="metadata" />
      )
    ) : project ? (
      <ProjectThumbnail type={project.thumbnail} />
    ) : (
      <div className="upload-no-media">
        <Image size={25} />
        <span>No media attached</span>
      </div>
    );
  }
  function postCard(p: UploadPost) {
    return (
      <article className="upload-post" key={p.id}>
        <div className="upload-post-media">{preview(p)}</div>
        <div className="upload-post-body">
          <div className="upload-post-meta">
            <span className={`upload-status ${p.status === "Planned" ? "planned" : ""}`}>
              <Clock size={12} />
              {p.status}
            </span>
            {p.sample && <span className="sample-label">Sample</span>}
            <span className="upload-post-channels">
              {p.channels.map((c) => (
                <ChannelIcon key={c} channel={c} />
              ))}
            </span>
          </div>
          <h3>{p.title}</h3>
          <p>{p.caption}</p>
          <div className="upload-post-bottom">
            <span>
              {p.scheduledAt
                ? new Date(p.scheduledAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "No date selected"}
            </span>
            <div>
              <Button
                variant="ghost"
                size="icon"
                title="Edit post"
                aria-label={`Edit ${p.title}`}
                onClick={() => compose(p)}
              >
                <Pencil size={15} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Duplicate post"
                aria-label={`Duplicate ${p.title}`}
                onClick={() => {
                  setUploadPosts((prev) => [
                    {
                      ...p,
                      id: crypto.randomUUID(),
                      title: `${p.title} (copy)`,
                      status: "Draft",
                      scheduledAt: "",
                      sample: false,
                    },
                    ...prev,
                  ]);
                  toast.success("Post duplicated");
                }}
              >
                <Copy size={15} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Move post to trash"
                aria-label={`Move ${p.title} to trash`}
                onClick={() => { trashPost(p.id); toast.success("Post moved to trash"); }}
              >
                <Trash2 size={15} />
              </Button>
            </div>
          </div>
        </div>
      </article>
    );
  }
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const offset = (month.getDay() + 6) % 7;
  return (
    <div className="upload-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR CONTENT, ALL IN ONE PLACE</div>
          <h1>Upload management</h1>
          <p>A little more rhythm for your next big idea.</p>
        </div>
        <div className="upload-heading-actions">
          <Button variant="outline" onClick={() => fileInput.current?.click()}>
            <Upload size={16} /> Upload media
          </Button>
          <Button onClick={() => compose()}>
            <Plus size={16} /> Create post
          </Button>
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/*,video/*"
        hidden
        onChange={(e) => void addFiles(e.target.files)}
      />
      <UploadNavigation />
      <div className="upload-notice">
        <ShieldCheck size={18} />
        <span>
          <b>Planning workspace</b> · Sample posts and session-only uploads. Accounts are not
          connected; posts will not publish.
        </span>
        <Link to="/uploads/accounts">
          Set up accounts <ArrowRight size={14} />
        </Link>
      </div>
      <div className="upload-summary">
        <div>
          <span>In the queue</span>
          <strong>
            {posts.filter((p) => p.status === "Planned").length}
            <small>planned posts</small>
          </strong>
        </div>
        <div>
          <span>Work in progress</span>
          <strong>
            {posts.filter((p) => p.status === "Draft").length}
            <small>drafts</small>
          </strong>
        </div>
        <div>
          <span>Media library</span>
          <strong>
            {media.length}
            <small>local files</small>
          </strong>
        </div>
        <div>
          <span>Connected channels</span>
          <strong>
            0<small>setup required</small>
          </strong>
        </div>
      </div>
      <div className="upload-toolbar">
        <div className="upload-view-toggle">
          {[
            { name: "Queue", icon: List },
            { name: "Calendar", icon: CalendarDays },
            { name: "Media library", icon: Image },
          ].map((v) => (
            <Button
              key={v.name}
              variant={view === v.name ? "secondary" : "ghost"}
              onClick={() => setView(v.name)}
            >
              <v.icon size={16} />
              {v.name}
            </Button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          title="Download planning data"
          aria-label="Download planning data"
          onClick={() =>
            downloadFile(
              JSON.stringify(
                { posts, note: "Planning only; no publishing credentials included." },
                null,
                2,
              ),
              "marvedge-upload-plan.json",
              "application/json",
            )
          }
        >
          <Download size={17} />
        </Button>
      </div>
      {view !== "Media library" && (
        <div className="upload-filter-bar">
          <label className="upload-search">
            <Search size={16} />
            <input
              aria-label="Search posts"
              placeholder="Search your posts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Filter channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            <option>All channels</option>
            {uploadChannels.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            aria-label="Filter status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option>All posts</option>
            <option>Planned</option>
            <option>Draft</option>
          </select>
        </div>
      )}
      {view === "Queue" && (
        <div className="upload-queue">
          <div className="upload-section-label">
            <h2>Your publishing queue</h2>
            <span>{filtered.length} posts</span>
          </div>
          {filtered.length ? (
            filtered.map(postCard)
          ) : (
            <div className="empty-state">
              <CalendarDays />
              <h3>No posts here yet</h3>
              <Button variant="outline" onClick={() => compose()}>
                Create post
              </Button>
            </div>
          )}
        </div>
      )}
      {view === "Calendar" && (
        <section className="upload-calendar-section">
          <div className="upload-section-label">
            <h2>{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
            <div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous month"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next month"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
          <div className="upload-calendar-scroll">
            <div className="upload-calendar">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div className="upload-day-heading" key={d}>
                  {d}
                </div>
              ))}
              {Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => {
                const day = i - offset + 1;
                const valid = day > 0 && day <= days;
                const date = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                return (
                  <div className={`upload-day ${valid ? "" : "outside"}`} key={i}>
                    {valid && (
                      <>
                        <span>{day}</span>
                        {filtered
                          .filter((p) => p.scheduledAt.startsWith(date))
                          .map((p) => (
                            <Button
                              key={p.id}
                              variant="ghost"
                              className="upload-calendar-post"
                              onClick={() => compose(p)}
                            >
                              <ChannelIcon channel={p.channels[0] || "All"} size={12} />
                              <span>{p.title}</span>
                            </Button>
                          ))}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
      {view === "Media library" && (
        <section
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void addFiles(e.dataTransfer.files);
          }}
        >
          <div className="upload-section-label">
            <h2>Media library</h2>
            <span>{media.length} files · this session</span>
          </div>
          <div className="upload-dropzone">
            <Upload size={26} />
            <h3>Make room for your next story</h3>
            <span>Images and videos · up to 250 MB each</span>
            <Button variant="outline" onClick={() => fileInput.current?.click()}>
              Choose files
            </Button>
          </div>
          <div className="upload-media-grid">
            {media.map((m) => (
              <article className="upload-media-item" key={m.id}>
                {m.kind === "image" ? (
                  <img src={m.url} alt={m.name} />
                ) : (
                  <video src={m.url} controls preload="metadata" />
                )}
                <div>
                  <b>{m.name}</b>
                  <span>{(m.size / 1024 / 1024).toFixed(1)} MB</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${m.name}`}
                    onClick={() => {
                      if (posts.some((p) => p.mediaId === m.id)) {
                        toast.error("Remove this file from its posts first.");
                        return;
                      }
                      trashMedia(m.id);
                      toast.success("Media moved to trash");
                    }}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    compose();
                    setEditing({ ...newPost(), title: m.name, mediaId: m.id });
                  }}
                >
                  Create post <ArrowRight size={14} />
                </Button>
              </article>
            ))}
          </div>
        </section>
      )}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="upload-composer">
          <DialogTitle>
            {posts.some((p) => p.id === editing?.id) ? "Edit post" : "Create a post"}
          </DialogTitle>
          <DialogDescription>Planning draft · no automatic publishing.</DialogDescription>
          {editing && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save("Draft");
              }}
            >
              <label className="field-label">
                Post title
                <input
                  className="form-input"
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              </label>
              <fieldset>
                <legend>Channels</legend>
                <div className="upload-channel-options">
                  {uploadChannels.map((c) => (
                    <label key={c}>
                      <input
                        type="checkbox"
                        checked={editing.channels.includes(c)}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            channels: e.target.checked
                              ? [...editing.channels, c]
                              : editing.channels.filter((ch) => ch !== c),
                          })
                        }
                      />
                      <ChannelIcon channel={c} />
                      {c}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="field-label">
                Caption
                <textarea
                  aria-label="Caption"
                  rows={4}
                  value={editing.caption}
                  onChange={(e) => setEditing({ ...editing, caption: e.target.value })}
                />
              </label>
              <div className="form-grid">
                <label className="field-label">
                  Project
                  <select
                    value={editing.projectId || ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        projectId: e.target.value || undefined,
                        mediaId: undefined,
                      })
                    }
                  >
                    <option value="">No project</option>
                    {projects.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Uploaded media
                  <select
                    value={editing.mediaId || ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        mediaId: e.target.value || undefined,
                        projectId: undefined,
                      })
                    }
                  >
                    <option value="">No media</option>
                    {media.map((m) => (
                      <option value={m.id} key={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field-label">
                Planned date & time (your local time)
                <input
                  className="form-input"
                  type="datetime-local"
                  value={editing.scheduledAt}
                  onChange={(e) => setEditing({ ...editing, scheduledAt: e.target.value })}
                />
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="upload-composer-actions">
                <Button type="submit" variant="outline">
                  Save draft
                </Button>
                <Button type="button" onClick={() => save("Planned")}>
                  <CalendarDays size={16} />
                  Add to plan
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function UploadAccountsPage() {
  const { credentialProfiles, setCredentialProfiles } = useWorkspace();
  const [method, setMethod] = useState<"Social account" | "API credentials">("Social account");
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState("LinkedIn");
  const [label, setLabel] = useState("");
  function setup(name: string, type: typeof method) {
    setProvider(name);
    setMethod(type);
    setLabel("");
    setOpen(true);
  }
  return (
    <div className="upload-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">ONE WORKSPACE. EVERY CHANNEL.</div>
          <h1>Accounts & credentials</h1>
          <p>Your publishing connections, together.</p>
        </div>
        <Button onClick={() => setup("LinkedIn", "Social account")}>
          <Plus size={16} />
          Add account
        </Button>
      </div>
      <UploadNavigation />
      <div className="upload-notice">
        <ShieldCheck size={18} />
        <span>
          <b>Secure setup required</b> · Account authorization and API key saving are unavailable
          until sign-in and secure storage are connected.
        </span>
      </div>
      <div className="upload-view-toggle upload-account-tabs">
        <Button
          variant={method === "Social account" ? "secondary" : "ghost"}
          onClick={() => setMethod("Social account")}
        >
          <Link2 size={16} />
          Social accounts
        </Button>
        <Button
          variant={method === "API credentials" ? "secondary" : "ghost"}
          onClick={() => setMethod("API credentials")}
        >
          <KeyRound size={16} />
          API credentials
        </Button>
      </div>
      <div className="upload-account-grid">
        {(method === "Social account"
          ? uploadChannels
          : ["Buffer", "Custom publishing service"]
        ).map((c) => (
          <article className="upload-account" key={c}>
            {method === "Social account" ? (
              <ChannelIcon channel={c} size={24} />
            ) : (
              <span className="upload-api-icon">
                <KeyRound size={24} />
              </span>
            )}
            <h3>{c}</h3>
            <span className="upload-account-state">Not connected</span>
            <Button variant="outline" onClick={() => setup(c, method)}>
              <Plus size={15} />
              Set up {method === "Social account" ? "account" : "credentials"}
            </Button>
          </article>
        ))}
      </div>
      <div className="upload-section-label">
        <h2>Setup profiles</h2>
        <span>{credentialProfiles.length} profiles</span>
      </div>
      {credentialProfiles.length ? (
        <div className="upload-profile-list">
          {credentialProfiles.map((p) => (
            <div key={p.id}>
              {p.method === "Social account" ? (
                <ChannelIcon channel={p.provider} />
              ) : (
                <KeyRound size={18} />
              )}
              <div>
                <b>{p.label}</b>
                <span>
                  {p.provider} · {p.method}
                </span>
              </div>
              <span className="upload-status">Setup needed</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${p.label}`}
                title="Remove profile"
                onClick={() =>
                  setCredentialProfiles((prev) => prev.filter((item) => item.id !== p.id))
                }
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="upload-account-empty">
          <ShieldCheck size={26} />
          <span>No account profiles yet</span>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="upload-composer">
          <DialogTitle>Set up {method.toLowerCase()}</DialogTitle>
          <DialogDescription>
            {method === "Social account"
              ? "Social accounts require provider authorization, not your password."
              : "Private API keys must be saved through a secure server-side credential form, not this planning workspace."}
          </DialogDescription>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setCredentialProfiles((prev) => [
                ...prev,
                { id: crypto.randomUUID(), provider, label: label.trim(), method },
              ]);
              setOpen(false);
              toast.success("Setup profile added. No credentials were collected.");
            }}
          >
            <label className="field-label">
              Service
              <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                {(method === "Social account"
                  ? uploadChannels
                  : ["Buffer", "Custom publishing service"]
                ).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Account label
              <input
                className="form-input"
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Marvedge marketing"
              />
            </label>
            <div className="info-note">
              Only the service name and label are saved in this session. No password, access token,
              or API key is requested or stored.
            </div>
            <Button disabled type="button">
              <ShieldCheck size={16} />
              {method === "Social account"
                ? "Authorize account · setup required"
                : "Save API key · setup required"}
            </Button>
            <Button type="submit" variant="outline">
              Save setup profile
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
