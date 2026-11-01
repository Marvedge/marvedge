<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Workspace architecture
- Keep site appearance in the root ThemeProvider with browser-local preference and system fallback; shared semantic tokens theme every page and portal without changing project media.
- Public marketing and account pages live outside the managed authenticated layout; workspace pages keep their existing URLs under that layout so account access is gated without losing navigation.
- Cloud Auth owns identities and owner-only profiles; WorkspaceProvider remounts per identity and syncs UUID projects, folders and drafts to owner-only tables (blob links stripped, samples local) so work persists without cross-account leakage.
- Use TanStack leaf routes for every workspace page and a shared root shell so navigation stays consistent.
- Keep remaining preference, media and planning state in the WorkspaceProvider for the session; do not imply remote persistence or connected services beyond what is saved.
- Keep workspace presentation styles and semantic palette tokens in src/styles.css so the supplied brand remains consistent across pages.
- Keep project editing, preview, and export in isolated project-ID leaf routes, with drafts in the WorkspaceProvider, so edits survive navigation without dashboard clutter.
- Keep the editor clip-first: properties open on demand, video and transition rows stay visible, unused tracks are optional, and overlapping events occupy separate rows; use shared browser metadata import to append videos without overlap.
- Use native getDisplayMedia and MediaRecorder only after a user action, stop all tracks on completion or unmount, and keep recordings session-local to protect capture permissions and privacy.
- Store timed events in a shared editor model and centralize timeline operations so undo, precision edits, canvas previews and draft downloads use the same data.
- Preview playback uses one timeline clock with draft speed; trim gestures freeze timeline geometry and commit a single undo entry so dragging stays stable.
- Use CSS custom properties for continuous editor geometry and semantic tokens for colors so canvas placement remains adjustable without bypassing theming.
- Keep illustrative analytics in a deterministic frontend dataset and label every report as sample activity so unconnected tracking is never mistaken for real customer data.
- Keep upload planning, local media, and non-secret account setup profiles in WorkspaceProvider; without app authentication and secure server storage, block credential collection and real publishing rather than simulate connected accounts.
- Keep recoverable trash and editable usage planning budgets in WorkspaceProvider; count known shared media sizes once including trash, preserve project drafts on restore, and never represent illustrative budgets as account entitlements.
