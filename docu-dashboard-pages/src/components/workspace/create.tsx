import { Link } from "@tanstack/react-router";
import { CalendarDays, Plus, Settings2 } from "lucide-react";
import { SourcePage } from "./creation-workflow";
import { UploadAccountsPage, UploadManagementPage } from "./upload-management";
export type CreateTab = "new" | "uploads" | "accounts";
const tabs = [
  { id: undefined, key: "new", label: "New project", icon: Plus },
  { id: "uploads", key: "uploads", label: "Upload & publish", icon: CalendarDays },
  { id: "accounts", key: "accounts", label: "Accounts", icon: Settings2 },
] as const;
export function CreatePage({
  initialType,
  initialMethod,
  tab = "new",
}: {
  initialType?: string;
  initialMethod?: string | undefined;
  tab?: CreateTab;
}) {
  return (
    <>
      <nav className="upload-navigation" aria-label="Create sections">
        {tabs.map((t) => (
          <Link
            key={t.key}
            to="/create"
            search={t.id ? { tab: t.id } : {}}
            className={tab === t.key ? "selected" : undefined}
          >
            <t.icon size={17} /> {t.label}
          </Link>
        ))}
      </nav>
      {tab === "uploads" ? (
        <UploadManagementPage />
      ) : tab === "accounts" ? (
        <UploadAccountsPage />
      ) : (
        <SourcePage initialType={initialType ?? "demo"} initialMethod={initialMethod} />
      )}
    </>
  );
}
