# T3Team Additive Whitelist Draft

This whitelist supports the additive guard in `.t3team-additive-guard.json`.

Guard runner: `t3team-additive-guard.mjs`

Prefix policy:

- New additive files may use either `t3team-` or `t3team.` prefixes.
- Route files use dot-separated TanStack route names and are valid additive files.

## Allowed Modified Upstream Files

- `README.md`
  - Describe this repository as the t3team fork (fork premise, pack model, current state) instead of the upstream one-line intro.
- `AGENTS.md`
  - Update project constitution reference from project-shell to t3team docs.
- `package.json`
  - Add `lint:t3team:additive` guard script entry.
- `apps/server/package.json`
  - Add `t3team` bin and `dev:t3team` / `start:t3team` scripts.
- `apps/server/src/server.ts`
  - Mount `/api/t3team/atlassian/*` routes in the main server so migrated `/t3team` UI sign-in does not 404.
- `apps/server/src/server.test.ts`
  - Provide the live `VcsProcess` layer in the server router seam test so repo-wide typecheck remains green after the shared VCS service split.
- `apps/server/tsdown.config.ts`
  - Bundle `src/t3team-bin.ts` alongside existing server bin.
- `apps/web/package.json`
  - Add migrated t3team dependencies used by the main app route.
- `apps/desktop/scripts/electron-launcher.mjs`
  - Use `ditto` on macOS when copying the Electron app bundle so dev launcher rebuilds preserve bundle symlinks and avoid locale copy failures.
- `apps/desktop/scripts/dev-electron.mjs`
  - Serialize desktop Electron dev supervision with a PID lock, orphan cleanup, and Vite readiness checks so restarts do not race stale processes or an unavailable dev server.
- `apps/desktop/src/window/DesktopWindow.ts`
  - Allow Atlassian OAuth `window.open` popups inside Electron instead of delegating them to the system browser.
- `apps/desktop/src/window/DesktopWindow.test.ts`
  - Cover in-app OAuth popup handling in the desktop shell.
- `apps/web/vite.config.ts`
  - Add dev proxy/defaults and compile-time constants used by migrated t3team route.
- `apps/web/src/routeTree.gen.ts`
  - Generated TanStack route tree update after adding `/t3team` route.
- `apps/web/src/routes/__root.tsx`
  - Register global t3team route shell entrypoint in root routing tree.
- `apps/web/src/components/settings/SettingsPanels.tsx`
  - Keep a minimal insertion seam (`<T3TeamProjectSetupSetting />`) so T3 Team project-workspace settings live in prefixed files while preserving upstream settings updates.
- `apps/web/src/components/ChatView.tsx`
  - Add `composerContextAttachmentSlot?: ReactNode` prop to both union variants, read context attachments from store in `onSend`, and render the slot above ChatComposer. Minimal upstreamable seam enabling t3team attachment chip injection.
- `apps/web/src/components/chat/MessagesTimeline.tsx`
  - Parse and render context attachment chips from user message text, then strip the inline attachment block from message body rendering so timeline displays clean content.
- `apps/web/src/composerDraftStore.ts`
  - Add optional `contextAttachments?: ComposerContextAttachment[]` field + 3 CRUD methods (`addContextAttachment`, `removeContextAttachment`, `clearContextAttachments`) to per-thread draft state. Generic, upstreamable extension point for ephemeral context attachments.
- `apps/server/src/provider/Layers/CodexSessionRuntime.ts`
  - Bind the in-process t3team tool broker into Codex session startup so dynamic tool registration and MCP-backed view/thread actions work per thread without introducing a second provider stack.
- `apps/server/src/provider/Layers/CodexSessionRuntime.test.ts`
  - Cover the Codex runtime's dynamic-tool thread-start payload and MCP binding behavior alongside the owning upstream runtime file.
- `apps/server/src/orchestration/Layers/ProjectionPipeline.ts`
  - Preserve optional `t3teamExt` on thread message upserts inside the existing projection pipeline so system-message metadata survives projection updates.
- `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts`
  - Decode and return optional `t3teamExt` from projection-thread message rows so the additive message seam is readable from snapshots.
- `apps/server/src/orchestration/decider.ts`
  - Add the minimal `thread.message.upsert` command-to-event seam needed to persist first-class system messages without forking the orchestration model.
- `apps/server/src/orchestration/projector.ts`
  - Project optional `t3teamExt` through thread message sent/update events so the read model keeps workflow message metadata.
- `apps/server/src/persistence/Layers/ProjectionThreadMessages.ts`
  - Persist optional `t3teamExt` JSON alongside existing projection-thread message fields as the smallest storage seam for workflow message metadata.
- `apps/server/src/persistence/Migrations.ts`
  - Register the additive t3team migration that adds `projection_thread_messages.t3team_ext_json`.
- `apps/server/src/persistence/Services/ProjectionThreadMessages.ts`
  - Extend the projection-thread message schema with optional `t3teamExt` so the persistence layer can carry the namespaced message extension.
- `packages/contracts/src/settings.ts`
  - Add optional `t3teamStoredProjectsJson` / `t3teamStoredSidebarPinsJson` / `t3teamStoredSidecarCompositionJson` client-setting keys so desktop-stable t3team project, sidebar-pin, and sidecar-composition persistence can reuse the existing local client-settings seam without widening unrelated runtime APIs.
- `apps/web/src/store.ts`
  - Thread optional `t3teamExt` through the existing chat-message mapper so user-visible timeline filtering/rendering can read the additive message seam.
- `apps/web/src/types.ts`
  - Add optional `t3teamExt` to the web chat-message type as the minimal client-side seam for workflow system message metadata.
- `packages/contracts/src/index.ts`
  - Export the additive `t3team-message-ext` contract from the shared contracts entrypoint so upstream seams can import the namespaced extension type.
- `packages/contracts/src/orchestration.ts`
  - Add optional `t3teamExt` and `thread.message.upsert` to the orchestration contract so first-class system messages flow through the existing command/event channel.
- `packages/project-context/src/index.ts`
  - Export additive action-recipe context helpers from the shared package entrypoint so runtime and UI code can share one canonical launch-context schema.
- `packages/contracts/src/sourceControl.ts`
  - Carry every authenticated source-control host, additively. `SourceControlProviderAuth` exposes a single `host`, so a user signed in to both `github.com` and a GitHub Enterprise host (e.g. `nexplore.ghe.com`) can only ever see one of them. The existing `host` field stays untouched; a new optional list is added alongside it.
- `packages/shared/src/sourceControl.ts`
  - Fix `isGitHubHost`, which classified hosts with `host.includes("github")`. That is `false` for `nexplore.ghe.com`, so GitHub Enterprise remotes resolved to provider `"unknown"` and every PR operation failed with "No unknown source control provider is registered."
- `apps/server/src/sourceControl/gitHubAuthStatus.ts`
  - Surface the full authenticated-host list already parsed from `gh auth status --json hosts` instead of collapsing it to the single active host. Existing single-host selection is preserved for backwards compatibility.
- `apps/server/src/sourceControl/GitHubSourceControlProvider.ts`
  - Populate the additive multi-host auth field from the probe result.
- `apps/server/src/sourceControl/SourceControlProviderRegistry.ts`
  - Pass the multi-host auth data through provider resolution.
- `bun.lock`
  - Lockfile drift due workspace/package updates.

- `docs/README.md`
  - Append a `## This fork (t3team)` section linking the fork's own docs (MVP spec, this whitelist, runbook engine). Purely additive tail; upstream's own index above it is untouched.
- `.github/workflows/ci.yml`
  - Point the three Linux jobs at `ubuntu-latest` instead of `blacksmith-8vcpu-ubuntu-2404`, and raise their timeouts to suit a 4-vCPU hosted runner. This fork has no Blacksmith runners, so CI had NEVER completed here — 20 sampled runs were 10 queued and 10 cancelled, zero pass or fail, which is why every fork PR sat at `mergeStateStatus: UNSTABLE`. The mobile job is gated to the upstream owner rather than repointed: it needs macOS plus `brew bundle` for native toolchains this fork does not build, and hosted macOS bills at 10x. Upstream runner names are kept in trailing comments so a future sync reads cleanly.

## Allowed Unprefixed New Files

Whole trees the fork owns outright. The `t3team-` prefix exists so a file added by
the fork can never collide with a file upstream adds later; a directory that upstream
does not have — and whose npm scope is the fork's own — already carries that guarantee,
so prefixing every file inside it adds noise without adding safety. This mirrors the
existing `docs/t3team-mvp/**` and `.claude/**` entries.

- `packages/runbook-core/**`, `packages/runbook-scripts/**`, `packages/runbook-threads/**`, `packages/runbook-tools/**`, `packages/runbook-ts/**`
  - The reusable runbook engine: five fork-authored packages under the `@runbook/*` npm scope, none of which exist upstream. 76 files consume them, and they are the subject of in-flight work (draft PR #9), so per-file renaming would be churn against active branches.
- `docs/runbook/**`
  - Design docs for the above.

## Rules

- Keep this list minimal.
- Any new entry requires a one-line reason in this document.
- Any changed file listed in `allowedModifiedFiles` must auto-merge cleanly against `baseRef` (`upstream/main` by default). If auto-merge is not possible, additive guard fails and prints a diff; user/agent must manually merge.
- Prefer additive `t3team-*` or `t3team.*` files over editing upstream files.
- Additive `.test`, `.browser`, `.stories`, and `*Fixtures` files use a higher LOC ceiling because they are validation/demo artifacts rather than shipped runtime surfaces.
- Remove entries when no longer needed.
