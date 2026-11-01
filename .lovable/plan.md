# Audit: buttons on every tab + feature coverage check

## Goal
Click every button on all 9 tabs, confirm where it goes or what it does, and check each feature number from the notebook against what the app actually does. Fix broken buttons; list missing features for you to approve.

## Step 1 — Button check (automatic click-through)
Run a signed-in click-through of every tab and record each button's result:
- Works (goes to the right page or does its job)
- Honest placeholder (clearly marked "coming soon" / "sample")
- Broken (does nothing, wrong page, error, or a dead end)

First scan result: about 230 buttons in total. Around 70 have no direct click action. Most of those are probably links or form submits, but each one gets checked. Places to look at closely:
- Brand Kit "add component" form (1 of 2 buttons wired)
- Integrations: webhook save, API, MCP (3 of 4 buttons are coming soon or unwired)
- Share & Hub (4 of 8 buttons disabled)
- Library and Projects (several buttons with no click action)
- Editor and the export/publish flow (26 buttons, 11 disabled)

Every broken button gets fixed in the same pass. Honest placeholders stay as they are.

## Step 2 — Feature mapping vs notebook and document
Your document's master table (section 14) lists feature **groups**, not one name per number. Each number gets checked by its group. Where the notebook and the document disagree, the notebook wins.

| Tab | Notebook numbers | Status today | Main gaps |
|---|---|---|---|
| Create / Editor | 1-10, 14-23, 25, 27, 28, 43-58, 75, 76, 84-86, 109-111, 117, 121, 122 | Recording, upload, URL/prompt start, timeline, transitions, watermark | Camera/mic controls (6-10, 111), hotspots/chapters for interactive demos (14-23), keyframes/zoom (43-58 partial), personalisation fields (75-76), lead form inside the demo (84-86), 117 is the marketing site (it doesn't belong in the app) |
| Projects | 38, 39, 42, 99 | Folders, trash, export, saved to account | 38/39 unclear (document lists them under Share), 99 export queue |
| Library | 26, 33 | Assets + templates | Team vs community templates (26A/26B), media not saved permanently |
| AI Studio | 11, 12, 24, 59-63, 65-74, 81-83, 88-90, 101-104, 106, 107, 116, 124 | 7 text tools with real AI | Recording agent and stale-demo upkeep (60-62), video variants and social exports (73-74), subtitles and dubbing as files (88-90); AI results can't be sent to a project yet |
| Share & Hub | 29-31, 34-37, 77, 80, 87, 91, 108, 112, 113, 115 | Link and embed, lead form, hub, team | Real public links, real lead collection, scheduling (112/113), approval rules (115) |
| Analytics | 78, 79, 123 | Sample charts, insights, sessions | Real tracking (needs public links first) |
| Brand Kit | 32, 92, 114 | Brand settings + saved components | Saving permanently; using saved components in the editor |
| Integrations | 64, 93 | Webhook form, API/MCP marked coming soon | Real webhook sending, CRM connections |
| Settings | 94-98, 105 | Profile, appearance, billing, trust center, help | Language and shortcuts (97), notification sending (98), 105 unclear |

Numbers missing from the notebook: 13 (placed in Export), 100 (Help), 118-120 (the document puts them in Editor/AI). These need a home.

## Step 3 — Deliverables
1. A report table with each feature number, its tab, and its status (Done / Partial / Placeholder / Missing), saved in the project's task list.
2. All broken buttons fixed.
3. A ranked list of missing features for you to pick from. Suggested order: real public share links + lead collection, then interactive demo hotspots, then AI results sent into projects.

## Questions to settle during the audit
- What should 38, 39 and 105 be? The document has no single name for each one.
- Should 117 (marketing website) be built as a public landing page?
- Where should 118-120 go?

## Technical notes
- The click-through uses a scripted browser signed in as you, with screenshots of each tab.
- Feature status comes from reading each tab's code, not from labels alone.
