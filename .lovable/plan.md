# Connect AI Studio to both editors

## Goal
Every AI Studio tool writes something real into your project, not just copyable text. The same tools also show up inside both editors.

## What each tool gives you, and where it lands
| Tool | Video editor | Guided demo editor |
|---|---|---|
| Plan & storyboard | Adds scene title cards on the text track, one per scene, at the AI's suggested times | Creates one step per scene with its title and tooltip text (blank image you replace) |
| Voiceover script | Adds the script as timed caption blocks; Copy and Download (.txt) also available | Fills each step's tooltip text from the script |
| Captions | Adds timed caption blocks on the text track in the chosen style | — (button hidden) |
| Translate | Translates the project's existing captions and replaces them; undo brings back the original | Translates every step title and tooltip |
| Repurpose to clips | Lists suggested clips with start/end; "Make clip" creates a new video project trimmed to that range | — |
| Personalise | Rewrites captions and the end button text for the prospect | Rewrites step text and end button for the prospect |
| AI Agent | Chat with follow-up questions, aware of the selected project's content | Same |

## How it works for you
- **AI Studio page:** pick a project (required for "Apply"), pick a tool, write a prompt, Generate. The result shows as a readable preview (scenes, captions, clips) with three buttons: **Apply to project**, **Open in editor**, **Copy**. Apply shows "Added 6 captions to Launch video" with an Undo link.
- **Inside the editors:** an **AI** button in the top bar opens a side panel with the tools that suit that editor. Results apply straight onto the open project. Undo works as normal. The "Planned" label on the video editor's AI Assistant goes away.
- **AI Agent** keeps the conversation (until you leave the page), with a "New chat" button.
- **Feedback:** clear loading state, friendly messages when the AI is busy or out of credits, and buttons disabled when there's nothing to act on.
- Personal data stays out: only the project name, captions/step text and your prompt are sent to the AI.

## Not included
- No generated voice audio or AI video editing. Repurpose picks time ranges; it can't see inside the video, so it works from your description and existing captions.

## Technical notes
- `ai-studio.functions.ts`: tools other than the agent use structured JSON output (per-tool zod schema: scenes[], captions[{start,duration,text}], clips[{title,start,end}], texts[]), validated server-side; agent accepts a message history. Keep `requireSupabaseAuth` and current error mapping.
- New `src/lib/ai-apply.ts` (pure, unit-tested): `applyToVideoDraft(draft, tool, result)` → new events via `eventTemplate("text", …)`; `applyToGuide(guide, tool, result)` → steps via demo-guide helpers; translate/personalise map over existing text by id.
- Shared `AiPanel` component used by the AI Studio page and both editors (via EditorTopBar slot); editors pass their commit function so undo history records one entry per apply.
- Repurpose "Make clip": new UUID video project with copied source and trimmed video event.
- Tests: apply captions adds text events at given times; plan → demo steps count; translate replaces text by id and keeps timings.
