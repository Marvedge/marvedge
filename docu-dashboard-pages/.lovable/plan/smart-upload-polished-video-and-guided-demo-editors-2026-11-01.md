# Smart upload + polished Video and Guided demo editors

## 1. Upload recognises the file and opens the right editor
One upload box on Create (and a drop zone on Home's "Upload" card) that accepts **videos and images**, one or many, by click or drag-and-drop.

| What you drop | Project created | Opens |
|---|---|---|
| One or more videos (MP4, WebM, MOV) | Video project, clips placed one after another on the timeline | Video editor |
| One or more images (PNG, JPG, WebP) | Guided demo, each image becomes a step in file-name order | Guided demo editor |
| Videos and images mixed | Asks: "Make a video" or "Make a guided demo" (images become still clips, or videos are skipped with a note) | The chosen editor |
| Anything else | Clear message: which files were skipped and why | — |

- The demo/video choice on the upload screen disappears — the files decide. A small badge confirms: "Detected 6 screenshots → Guided demo".
- Project name is pre-filled from the first file name (editable).
- Uploading skips the review step and lands straight in the editor.
- Files are checked by their real type, not just the file name ending.

## 2. Shared editor look
Both editors get the same frame so they feel like one product:
- **Top bar:** back to Projects, editable project name, save status ("Saved" / "Saving…"), Undo / Redo, Preview, and one main **Export / Share** button. Secondary actions go into a single "More" menu.
- **Consistent buttons:** one main action per area, icon + label for important actions, icon-only with hover hints for small tools, clear disabled states, keyboard shortcuts shown in hints.
- **Layout:** left = content list, centre = canvas, right = properties panel that opens when something is selected and can be closed.
- Empty states that tell you what to do next ("Drop videos here to start").
- Works in light and dark mode; tidier spacing at smaller screen widths like yours (~950px).

## 3. Video editor improvements
- Toolbar grouped into: Add (video, image, text, transition), Edit (split, trim, delete, duplicate), View (zoom timeline, fit).
- Bigger play/pause with time display and frame-step buttons under the canvas.
- Timeline: clearer clip blocks with thumbnails and names, visible playhead, snapping, drag-to-add files straight onto the timeline (also uses the auto-detect).
- Properties panel tabs: Clip, Text, Transition, Speed.

## 4. Guided demo editor improvements
- Left: step list with thumbnails, drag to reorder, chapter headers, add/duplicate/delete per step, drop more screenshots to append.
- Centre: screenshot with hotspot; hotspot can be dragged to move; tooltip preview shown live in place.
- Right: step panel — title, text, tooltip side, button label, chapter.
- "Play demo" button opens the guided preview from the current step.

## Technical notes
- New `src/lib/media-detect.ts`: classify `File[]` into video / image / unsupported by MIME (fallback to extension); pure, unit-tested.
- Creation flow: `upload` method accepts `video/*,image/*` multiple; builds a video project with clips via existing shared metadata import, or a demo project whose `draft.guide` steps use the existing downscaled data-URL helper; navigates to `/editor/$projectId`.
- Shared `EditorTopBar` component used by `editor.tsx` and `demo-editor.tsx`; editor styles kept in `src/styles.css` with semantic tokens.
- Hotspot drag and step reorder update the guide via existing demo-guide helpers so undo/save keep working.
- Tests: media detection (videos→video, images→demo, mixed, unsupported) and step ordering from file names.
