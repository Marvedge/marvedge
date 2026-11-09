import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  House,
  Folder,
  Plus,
  ChartNoAxesCombined,
  Palette,
  Plug,
  CreditCard,
  CircleHelp,
  Settings,
  ChevronsUpDown,
  ChevronDown,
  Search,
  Bell,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowUpRight,
  Check,
  X,
  Bot,
  Library,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace";
import { useAccount } from "@/lib/account";
import { UsageBars } from "./usage-bars";
import { ThemeToggle } from "@/components/theme-toggle";
const navigation = [
  { label: "Home", path: "/home", icon: House },
  { label: "Projects", path: "/projects", icon: Folder },
  { label: "Create", path: "/create", icon: Plus },
  { label: "Library", path: "/library", icon: Library },
  { label: "AI Studio", path: "/ai-studio", icon: Bot },
  { label: "Share & Hub", path: "/share", icon: Share2 },
  { label: "Analytics", path: "/analytics", icon: ChartNoAxesCombined },
  { label: "Brand Kit", path: "/brand-kit", icon: Palette },
  { label: "Integrations", path: "/integrations", icon: Plug },
] as const;
const accountNav = [
  { label: "Subscription", path: "/subscription", icon: CreditCard },
  { label: "Help Center", path: "/help", icon: CircleHelp },
  { label: "Settings", path: "/settings", icon: Settings },
] as const;
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState("");
  const [search, setSearch] = useState("");
  const { profile, projects } = useWorkspace();
  const { user, profile: accountProfile, signOut } = useAccount();
  const accountName = accountProfile?.display_name || user?.email?.split("@")[0] || profile.name;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title =
    [...navigation, ...accountNav].find((i) => i.path === pathname)?.label || (pathname === "/trash" ? "Trash" : "Project editor");
  return (
    <div className={`workspace ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <Link to="/home" className="brand">
          <span className="brand-mark">
            m<span />
          </span>
          <span>
            marvedge<span className="brand-dot">.</span>
          </span>
        </Link>
        <Button
          variant="ghost"
          className="workspace-switch"
          onClick={() => setMenu(menu === "workspace" ? "" : "workspace")}
          title="Workspace"
        >
          <span className="workspace-avatar">M</span>
          <span className="workspace-name">
            {profile.workspace}
            <small>Personal workspace</small>
          </span>
          <ChevronsUpDown size={15} />
        </Button>
        {menu === "workspace" && (
          <div className="sidebar-popover">
            <Check size={14} /> {profile.workspace}
            <span className="text-muted-foreground text-xs">Single workspace preview</span>
          </div>
        )}
        <span className="nav-label">WORKSPACE</span>
        <nav className="primary-nav">
          {navigation.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              activeOptions={{ exact: true }}
              activeProps={{ className: "nav-link nav-active" }}
              inactiveProps={{ className: "nav-link" }}
              title={item.label}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.label === "Create" && <kbd>+</kbd>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-lower">
          <span className="nav-label">MANAGE</span>
          <nav>
            {accountNav.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                activeProps={{ className: "nav-link nav-active" }}
                inactiveProps={{ className: "nav-link" }}
                title={item.label}
              >
                <item.icon size={19} />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
          <div className="plan-note">
            <span className="plan-note-icon">✧</span>
            <b>A little more possibility.</b>
            <p>Find the right plan for your next big idea.</p>
            <Button variant="outline" asChild>
              <Link to="/subscription">
                Explore plans <ArrowUpRight size={15} />
              </Link>
            </Button>
          </div>
          <Button
            variant="ghost"
            className="sidebar-profile"
            onClick={() => setMenu(menu === "profile" ? "" : "profile")}
          >
            <span className="avatar">
              {accountName
                .split(" ")
                .map((s) => s[0])
                .join("")
                .slice(0, 2)}
            </span>
            <span>
              {accountName}
              <small>Personal account</small>
            </span>
            <ChevronDown size={15} />
          </Button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="topbar-location">
            <Button
              variant="ghost"
              size="icon"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
            <span className="top-divider" />
            <span>{title}</span>
          </div>
          <div className="topbar-actions">
            <ThemeToggle />
            <Button
              variant="ghost"
              className="global-search"
              onClick={() => setMenu(menu === "search" ? "" : "search")}
            >
              <Search size={17} />
              <span>Search anything...</span>
              <kbd>⌕</kbd>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Notifications"
              title="Notifications"
              onClick={() => setMenu(menu === "notifications" ? "" : "notifications")}
            >
              <Bell />
            </Button>
            <Button variant="ghost" size="icon" asChild title="Help Center">
              <Link to="/help" aria-label="Help Center">
                <CircleHelp />
              </Link>
            </Button>
            <Button
              variant="ghost"
              className="top-avatar"
              aria-label="Account menu"
              onClick={() => setMenu(menu === "profile" ? "" : "profile")}
            >
              <span className="avatar">{accountName.slice(0, 2).toUpperCase()}</span>
            </Button>
          </div>
          {menu === "notifications" && (
            <div className="header-popover">
              <h3>Notifications</h3>
              <p>You’re all caught up.</p>
              <small>Project updates will appear here when processing is connected.</small>
            </div>
          )}
          {menu === "profile" && (
            <div className="header-popover">
              <h3>{accountName}</h3>
              <Link to="/settings" onClick={() => setMenu("")}>
                Account settings →
              </Link>
              <span className="sample-label">Preview workspace</span>
              <Button variant="ghost" onClick={signOut}>Sign out</Button>
            </div>
          )}
          {menu === "search" && (
            <div className="header-popover search-popover">
              <label className="search-field">
                <Search size={17} />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects..."
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close search"
                  onClick={() => setMenu("")}
                >
                  <X />
                </Button>
              </label>
              {projects
                .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
                .map((p) => (
                  <Link
                    key={p.id}
                    to="/editor/$projectId"
                    params={{ projectId: p.id }}
                    onClick={() => setMenu("")}
                  >
                    {p.name} <ArrowUpRight size={14} />
                  </Link>
                ))}
            </div>
          )}
        </header>
        <main className="page-content"><UsageBars />{children}</main>
        <footer className="workspace-footer">
          <span>Made for your next big idea.</span>
          <span>
            Marvedge <span>✧</span>
          </span>
        </footer>
      </div>
    </div>
  );
}
