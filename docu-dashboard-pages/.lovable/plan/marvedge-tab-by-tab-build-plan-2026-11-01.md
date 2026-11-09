# Marvedge — Tab-by-Tab Build Plan

Source of truth: your notebook page for which feature numbers live in which tab; the blueprint for what each feature group does. Where the two disagree (e.g. 38, 39, 42 are "Share & Publish" in the blueprint but "Project" in your notes), your notes win.

Core flow every tab plugs into: **Create -> Edit -> Personalise -> Publish -> Analyse -> Optimise**.

## 1. Tab map (navigation order = build order)

| # | Tab | Feature IDs (from your notes) | Role in the flow |
|---|-----|-------------------------------|------------------|
| 1 | Home + Create | 1-10, 14-23, 25, 27, 28, 43-58, 75, 76, 84-86, 109-111, 117, 121, 122 | Start point: Quick Create (Record, Upload, URL, Prompt, AI Agent), recording, capture, and the Universal Editor |
| 2 | Projects | 38, 39, 42, 99 | Manage everything created: folders, versions, trash/restore, export |
| 3 | Library | 26, 33 | Reusable assets and templates used inside the editor |
| 4 | AI Studio | 11, 12, 24, 59-63, 65-74, 81-83, 88-90, 101-104, 106, 107, 116, 124 | Plan, generate, repurpose, translate, dub, personalise |
| 5 | Share & Hub | 29-31, 34-37, 77, 80, 87, 91, 108, 112, 113, 115 | Publish links/embeds, lead forms, demo hubs, collaboration |
| 6 | Analytics | 78, 79, 123 | Demo reports, funnels, global insights |
| 7 | Brand Kit | 32, 92, 114 | Logos, colours, fonts, saved components applied everywhere |
| 8 | Integrations | 64, 93 | CRM, webhooks, API/MCP connections |
| 9 | Settings | 94-98, 105 | Account, security/trust, billing, preferences, notifications |

Note: 13 and 100 are not on your page (blueprint puts them in Export and Help). I'll place 13 inside the editor's Export and 100 in Help unless you say otherwise.

## 2. How tabs connect

```text
Home/Create --makes--> Project --opens--> Editor
Editor <--pulls-- Library (assets, templates) & Brand Kit (styles)
Editor <--assist-- AI Studio (generate, voice, translate, personalise)
Project --publish--> Share & Hub --events--> Analytics
Share & Hub --leads--> Integrations (CRM / webhook)
Settings --> plan limits, team roles, notifications used by all tabs
```

Shared building blocks reused across tabs: project card, asset card, Create menu, status badge, empty state, usage meter, side panel, confirm dialog.

## 3. Tab 1 in detail — Home + Create (build first)

**Home page sections**
- Welcome header with workspace name and the main "Create" button.
- Quick Create cards: Record, Upload, Create from URL, Generate from prompt, AI Agent.
- Recent projects (4-8 cards: thumbnail, title, status, last edited, open/duplicate/delete).
- Performance snapshot (views, completion, leads) — labelled sample data until real tracking exists.
- Getting Started checklist (create first demo, add brand, publish, share).
- Usage meter and help links.

**Create flow (one wizard, opened from Home or the global Create button)**
- Step 1 choose method: Record (screen, screen + camera, camera, walkthrough capture — 2-10, 111), Upload, From URL / page capture (4, 5), From prompt (1).
- Step 2 settings: title, aspect ratio, template, brand kit toggle.
- Step 3 result: new project opens in the Universal Editor.

**Universal Editor (14-23, 25, 27, 28, 43-58, 109, 110, 121, 122)**
- Top bar: title, undo/redo, preview, export, publish.
- Left tools: Media, Text, Annotations, Focus and Effects, Interactive (hotspots, steps), AI assist.
- Centre: canvas preview. Right: properties panel (opens on demand).
- Bottom: timeline (video, screen, camera, audio, music, text rows).
- Personalisation and lead pieces placed in the editor (75, 76, 84-86): variables, forms, CTA, calendar booking — configured here, reported in Analytics later.

**Buttons -> destination**
- Create / Quick Create card -> Create wizard.
- Recent project card -> Editor. "View all" -> Projects.
- Checklist "Add brand" -> Brand Kit. "Publish" -> Share & Hub.
- Editor Export -> Export page. Editor Publish -> Share & Hub.

**Done when:** a signed-in user can start from Home, create a project by any method, land in the editor, and see it in Recent projects.

## 4. Next tabs

After Tab 1 is approved and built, I'll write the same detailed section (sections, components, buttons, connections, done-check) for Projects, then each tab in table order — one at a time.

## Technical details
- Existing pages under the signed-in area (home, create, record, editor, export, projects, ai-studio, etc.) are reused; new tabs (Library, Share & Hub) get their own pages and side-menu entries.
- Projects and assets move from session-only storage to saved database tables with per-user access rules, so work persists across sign-ins.
- Real-only claims: recording uses the browser's built-in screen capture; analytics, AI and integrations show clearly labelled sample states until each is connected.
