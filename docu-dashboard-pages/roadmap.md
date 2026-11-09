# Marvedge dashboard
- [x] Add site-wide dark mode, shared switches, and remembered appearance; verified public, workspace, editor, export, and dialogs.
- [x] Build shared workspace navigation and Home with supplied palette.
- [x] Build Projects and Create pages with usable sample project actions.
- [x] Build demo/video editing, preview, and draft download controls; live processing and publishing remain explicitly planned.
- [x] Build Analytics, Brand Kit, Integrations, Subscription, Help Center, and Settings pages with honest unavailable states.
- [x] Verify navigation, creation and editing, and smaller-screen layout.

## Expanded editor workflow
- [x] Add URL/prompt/upload setup and browser screen recording with review.
- [x] Separate editor from dashboard and expand canvas, effects, text, interactions, audio, and timeline controls.
- [x] Preserve editor drafts across navigation; add review and delivery pages.
- [x] Verify recording permissions/recovery, editor changes, preview, downloads, and compact layouts.
- [x] Add clearly labeled sample analytics data to visualize analytics features.

## Upload management
- [x] Add Buffer-style queue, calendar, media uploads, and post composition.
- [x] Add social account and API credential setup management without collecting secrets in the browser.
- [x] Connect editor and export to the upload queue and verify navigation and post changes.

## Trash and workspace usage
- [x] Add session-local trash for projects, posts, and unused media with restore and confirmed permanent deletion.
- [x] Add shared usage/storage bars and editable planning budgets without implying real plan entitlements.
- [x] Verify trash recovery, storage changes, and compact page layouts.
## Landing and accounts
- [x] Add public landing and sign-in/sign-up/password recovery pages.
- [x] Connect real accounts and private personal profiles with Lovable Cloud.
- [x] Preserve workspace navigation; verified sign-in, persisted profile edits, sign-out and signed-out access blocking. Google round trip and confirmation/recovery email delivery require a real recipient.

## Editor layout refinement
- [x] Simplify editor navigation and improve canvas, inspector, and timeline spacing.
- [x] Verify editing, undo, preview navigation, and compact layouts while signed in.
- [x] Make the editor clip-first with spacious video and transition rows, direct video addition, and on-demand properties.
- [x] Verify adding multiple videos, transitions, undo, and compact editor layout.

- [x] Canva-style transition system: animated preview picker, clip-join markers, duration/easing controls
- [x] Interactive trim: drag clip edges to trim, right-click menu (properties, split, duplicate, delete)
- [x] Fix reliable edge dragging and trimmed playback; verified undo and media bounds.
- [x] Add export video speed, preview and speed-adjusted draft/caption downloads; verified with imported video.

## Tab-by-tab build (blueprint)
- [x] Tab 1 Home + Create: quick create, performance snapshot, usage meter, create method links
- [x] Tab 2 Projects: folders, move to folder, export action, trash shortcut
- [x] Tab 3 Library: assets + templates
- [x] Tab 4 AI Studio: 7 real AI tools
- [x] Tab 5 Share & Hub: link, embed, lead form, hub, team
- [x] Tab 6 Analytics: insights + viewer sessions
- [x] Tab 7 Brand Kit: saved components
- [x] Tab 8 Integrations: webhook planner, API & MCP placeholders
- [x] Tab 9 Settings: appearance, billing, trust center, help tabs
- [x] Save projects, folders and editor drafts to the account (media still session-only)

## Audit (Nov 1) — buttons + feature coverage
- [x] Click-through of 15 pages signed in: 0 errors, 0 broken links (22 internal links checked). Disabled on purpose: API key, MCP, Empty trash (when empty), Manage subscription.
- Feature status (notebook numbers; Done / Partial / Missing):
  - Create/Editor — Done: 1-5, 25, 27, 28, 43-50 (timeline, trim, split, transitions, text, speed), 121-122 basic. Partial: 6-10/111 (screen only, no camera/mic picker), 14-23 (no hotspots/chapters), 51-58 (no keyframes/auto-zoom), 109-110. Missing: 75-76 personalisation fields, 84-86 lead form inside demo. 117 = marketing site (public landing exists).
  - Projects — Done: 42 trash/recovery, folders. Partial: 99 export (downloads draft, no render queue). Unclear: 38, 39.
  - Library — Partial: 26 (starter templates only, no team/community), 33 (media not saved permanently).
  - AI Studio — Done as text: 11, 12, 24, 59, 63, 65-70, 81-83, 101-104, 106, 107, 124. Missing: 60-62 recording agent/upkeep, 71-74 video variants, 88-90 subtitle/dub files, 116. AI results can't be sent into a project.
  - Share & Hub — Partial: 29-31, 34-37 (preview link only), 77/80/87 (lead form designer, no collection), 91 team list (no invites). Missing: 108, 112-113 scheduling, 115 approvals.
  - Analytics — Placeholder: 78, 79, 123 (sample data).
  - Brand Kit — Partial: 32, 92, 114 (session only, not usable in editor).
  - Integrations — Placeholder: 64, 93.
  - Settings — Done: 94 trust center, 95 billing page, 96 help, 97 theme. Missing: 97 language/shortcuts, 98 notification sending. Unclear: 105.
- [ ] Next (waiting on your pick): 1) real public share links + lead collection, 2) demo hotspots/chapters, 3) send AI results into projects.
- [x] Placed: 38-39 (version history & duplicates) in Projects; 105 (language & shortcuts) in Settings; 118-120 (advanced AI/creative tools) in AI Studio.
- [x] Split editor: Video editor for videos, Guided demo editor (screenshot steps, hotspots, tooltips, chapters, end button, Try it player) for demos.
