# Remove Trash from sidebar, merge Uploads into Create

## Goal
- The left menu no longer shows **Trash** or **Uploads**.
- **Create** becomes the single place to start something new *and* to manage uploads/publishing.
- Trash still works — it is just reached from Projects (existing "Trash (n)" button) and the storage meter, not the sidebar.

## New Create page layout
Create gets a tab bar at the top:

```text
Create
[ New project ]  [ Upload & publish ]  [ Accounts ]
```

- **New project** (default) — the existing demo/video wizard (URL, prompt, upload, record). Unchanged.
- **Upload & publish** — everything currently on the Uploads page: media upload, content planning, publishing queue.
- **Accounts** — the current Upload accounts page (social account / credential setup profiles).

The selected tab lives in the address (`/create?tab=uploads`), so links can open it directly and the back button works.

## Sidebar after the change
WORKSPACE: Home, Projects, Create, Library, AI Studio, Share & Hub, Analytics, Brand Kit, Integrations
MANAGE: Subscription, Help Center, Settings

## Links that move
| Where | Old target | New target |
|---|---|---|
| Library "Upload media" (2 buttons) | /uploads | /create?tab=uploads |
| Editor menu "Upload management" | /uploads | /create?tab=uploads |
| Export page "Add to upload queue" | /uploads | /create?tab=uploads |
| Storage meter "Manage media" | /uploads | /create?tab=uploads |
| Upload page "Accounts" links | /uploads/accounts | /create?tab=accounts |
| Projects "Trash (n)", meter "Manage trash" | /trash | unchanged |

Old `/uploads` and `/uploads/accounts` addresses redirect to the matching Create tab so bookmarks keep working. `/trash` stays as a page.

## Technical notes
- `shell.tsx`: drop Uploads and Trash entries; title logic maps `/create` tabs.
- `create.tsx` route: add `tab: "new" | "uploads" | "accounts"` to validateSearch; `CreatePage` renders a tab bar and switches between `SourcePage`, `UploadManagementPage`, `UploadAccountsPage`.
- `upload-management.tsx`: remove its own sub-navigation (`UploadNavigation`) since Create's tabs replace it; repoint internal links.
- `uploads.index.tsx` / `uploads.accounts.tsx`: replace components with `beforeLoad` redirects to `/create?tab=…`.
- Update `app-routing.test.tsx` (keep `/uploads` and `/trash` under the account layout) and add a test that `/uploads` redirects to the Create uploads tab.
- No data or saving changes.
