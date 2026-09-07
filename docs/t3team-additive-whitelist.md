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
- `apps/web/src/rightPanelStore.ts`
  - Add the `thread` (side-chat) surface kind: `thread:<threadId>` reference surfaces plus the `openThreadSurface` action (no-op for the thread's own id), and v12 persistence migration that validates thread-surface references.
- `apps/web/src/rightPanelStore.test.ts`
  - Unit tests for the side-chat surface: open/activate, no-self, peer-tab coexistence, per-thread scoping, close fallback, and migration validation.
- `apps/web/src/components/RightPanelTabs.tsx`
  - Tab title (thread-shell registry, "Thread" fallback) and `MessagesSquare` icon for `thread` surfaces so side chats render as standard tabs alongside Files/Agents/Preview.
- `apps/web/src/components/RightPanelTabs.test.tsx`
  - Tests for side-chat tab labeling: shell-title labels, fallback, and coexistence with browser tabs.
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
- `packages/shared/package.json`
  - Add the `./t3team-githubActivity` subpath export so `apps/server` and `apps/web` can both import the moved GitHub work-item association/grouping helpers from one module.

- `docs/README.md`
  - Append a `## This fork (t3team)` section linking the fork's own docs (MVP spec, this whitelist, runbook engine). Purely additive tail; upstream's own index above it is untouched.
- `.github/workflows/ci.yml`
  - Point the three Linux jobs at `ubuntu-latest` instead of `blacksmith-8vcpu-ubuntu-2404`, and raise their timeouts to suit a 4-vCPU hosted runner. This fork has no Blacksmith runners, so CI had NEVER completed here — 20 sampled runs were 10 queued and 10 cancelled, zero pass or fail, which is why every fork PR sat at `mergeStateStatus: UNSTABLE`. The mobile job is gated to the upstream owner rather than repointed: it needs macOS plus `brew bundle` for native toolchains this fork does not build, and hosted macOS bills at 10x. Upstream runner names are kept in trailing comments so a future sync reads cleanly.
- `scripts/release-smoke.ts`
  - Add the three fork package manifests the smoke workspace needs. `apps/desktop` depends on `@t3tools/integrations-atlassian` (which pulls `integrations-core` and `project-context`); without them the temp workspace fails with `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` before exercising any release step. Additive list entries only.
- `apps/server/src/orchestration/Layers/CheckpointReactor.ts`
  - One extra disjunct so messages mirrored from an external Codex/Claude session (`messageId` prefixed `local:`) are checkpointed like any other turn. Without it a session adopted from the native tool has no pre-turn baseline and cannot be reverted. Three lines; the reactor's own logic is untouched.

## GHE #342 — mobile-first touch targets + keybindings panel fit

- `apps/web/src/components/settings/KeybindingsSettings.tsx`
  - Responsive keybinding table below 768px: drop the 680px min-width, reflow rows 4-column to 2-column, raise row height to a 44px touch floor. Class-string-only changes; row logic untouched.
- `apps/web/src/components/ui/menu.tsx`
  - 44px min-height floor on menu items below 768px (`max-md:min-h-11`) so phone tap targets meet the 44px minimum; desktop unchanged.
- `apps/web/src/components/ui/toggle.tsx`
  - 44px height floor on Toggle control sizes below 768px, mirroring the Button phone floors; desktop unchanged.

## GHE #208 — deterministic 4-state activity word + throttled LLM enrichment

- `packages/shared/src/t3team-threadRunStatus.ts`
  - Expose `activityState` on `ThreadRunStatus` so the running-thread rollup carries the deterministic state word alongside the label.
- `apps/server/src/t3team-activityLabelReactor.ts`
  - Mount the deterministic state tracker on `ProviderService.streamEvents` (always on, ungated) and feed coarse state changes to the throttled LLM summarizer; the `t3teamActivityLabelsEnabled` flag now gates only the enrichment.
- `apps/server/src/t3team-activityLabelSummarizer.ts`
  - Replace the per-kind-class immediate flush with a coarse-state-change trigger plus a 60s minimum regenerate cadence; carry `activityState` into the generation context.
- `apps/server/src/t3team-activityLabelSummarizer.test.ts`
  - Re-base the kind-class immediacy test onto the new state-change trigger and cover the minimum regenerate cadence.
- `apps/web/src/t3team/t3team-types.ts`
  - Add `activityState` / `activityStateUpdatedAt` to `ProjectThread` for the sidebar pills.
- `apps/web/src/t3team/t3team-threadStatusPillTypes.ts`
  - Add `activityState` to the thread status pill so resolvers and rows share one shape.
- `apps/web/src/t3team/components/t3team-projectSidebarStatusPills.ts`
  - Resolve the state word, its per-state color/pulse (`waiting` rests), and carry both into the pill and project rollup.
- `apps/web/src/t3team/components/t3team-projectSidebarStatusPills.test.ts`
  - Cover the 4 states through the resolver, the `{state} · {detail}` composition, flag-off word-only, and the no-state pre-#208 fallback.
- `apps/web/src/t3team/components/t3team-ProjectSidebarThreadRow.tsx`
  - Render the composed pill text (`{state} · {detail}`) instead of label-only in the row tooltip.
- `apps/web/src/t3team/components/t3team-ProjectSidebarProjectHeader.tsx`
  - Same composed text in the project-rollup tooltip.
- `apps/web/src/t3team/components/t3team-LocalWorkspaceSidebarRow.tsx`
  - Same composed text in the local-workspace row tooltip.
- `apps/web/src/t3team/hooks/t3team-threadBridge.ts`
  - Map live `activityState` / `activityLabel` / `activityStateUpdatedAt` onto `ProjectThread` so the pills update without a reload.
- `apps/web/src/t3team/hooks/t3team-threadBridge.test.ts`
  - Cover the live-thread → `ProjectThread` state mapping.
- `apps/web/src/t3team/t3team-threadToolContextEquality.ts`
  - Diff `activityState` / `activityLabel` through the upsert equality gate or state transitions would not re-render rows.
- `apps/web/src/t3team/stories/t3team-ActivityLabelPill.stories.tsx`
  - Extend the #40 stories: one story per state word, enrichment composition, flag-off, idle-cleared, and reduced-motion.

## Upstream sync remediation 2026-09-07 (sync point e5d086c262)

Fork deltas that cannot live in `t3team-*` modules (provider-adapter seams, CLI wiring,
contracts fields, or tests that directly exercise upstream modules). Each entry was
reviewed against `git diff e5d086c262 -- <file>` during the sync-branch guard remediation
(branch `nexi/sync-current-main-20260907`); all 57 await human approval.

- `apps/desktop/src/app/DesktopStatePaths.ts`
  - Optional `defaultDirName` so distribution builds root state under the branded dir instead of `.t3`.
- `apps/desktop/src/backend/DesktopBackendConfiguration.ts`
  - Branded-build legacy home migration (`migrateLegacyHomeIfNeeded` moves `~/.t3` state) plus asar-aware fs probe.
- `apps/server/integration/orphanedProviderSessionStartup.integration.test.ts`
  - Stub the fork-added ProviderUsageHolds repository methods on the server layer mocks.
- `apps/server/scripts/cli.ts`
  - Distribution `web` subcommand spawns `vp build` via `resolveSpawnCommand`.
- `apps/server/scripts/cliErrors.ts`
  - `ServerCliWebClientMissingError` tagged error for the `web` subcommand.
- `apps/server/src/attachmentStore.test.ts`
  - Test: arbitrary (non-image) files store under their real extension; images unchanged.
- `apps/server/src/cli/config.test.ts`
  - Headless CLI config tests: mocks `@t3code/distribution` branding, derives paths from branded `userDataDirName`.
- `apps/server/src/cli/config.ts`
  - State dir derived from distribution branding `userDataDirName` when set.
- `apps/server/src/cli/pair.ts`
  - Same branded-dir derivation for the `pair` subcommand.
- `apps/server/src/cli/server.ts`
  - Drop `forceAutoBootstrapProjectFromCwd` (headless serve passed `false`; option unused on the distribution surface; fork commit 1c4519f643).
- `apps/server/src/httpCors.ts`
  - `browserApiCorsHeaders` export for the fork's in-browser API surface.
- `apps/server/src/orchestration/Normalizer.attachments.test.ts`
  - Tests that inline file attachments normalize under a fixed `.bin` extension.
- `apps/server/src/os-jank.ts`
  - `hydratePosixPath` with injectable `readLoginShellPath`/`readLaunchctlPath`/`isDirectory` for the fork's tool-home PATH discovery.
- `apps/server/src/os-jank.test.ts`
  - Tests for the `hydratePosixPath` PATH-append behavior.
- `apps/server/src/project/AgentSessionImporter.test.ts`
  - Stub fork-added service methods (sweep/checkThreadHeld/holds) on the test layer.
- `apps/server/src/project/AgentSessionScanner.test.ts`
  - Stub fork-added thread-relation service methods on the test layer.
- `apps/server/src/provider/Drivers/instanceIdentity.ts`
  - Pass through pack-sourced `iconDataUrl` / `configurationSource: "pack"` on provider instances.
- `apps/server/src/provider/Layers/ClaudeProvider.ts`
  - Distribution model catalog: Claude 5.x family (Opus 5 / Fable 5) with per-model minimum CLI versions.
- `apps/server/src/provider/Layers/CodexAdapter.ts`
  - Resolve image attachments into the turn payload; `isProcessAlive`-guarded restart path.
- `apps/server/src/provider/Layers/CodexAdapter.test.ts`
  - Test: file attachments are skipped when building the Codex turn payload.
- `apps/server/src/provider/Layers/CursorAdapter.ts`
  - Comment-only update: non-image attachments reach Cursor via the ProviderService path line.
- `apps/server/src/provider/Layers/CursorAdapter.test.ts`
  - Test that file attachments are not inlined into the Cursor ACP prompt.
- `apps/server/src/provider/Layers/GrokAdapter.ts`
  - Resolve image attachment parts (drop undefined) before building the ACP prompt.
- `apps/server/src/provider/Layers/GrokAdapter.test.ts`
  - Test that file attachments are not inlined into the Grok ACP prompt.
- `apps/server/src/provider/Layers/ProviderRegistry.test.ts`
  - Tests that the fork catalog exposes Claude Opus 5 on supported Claude Code versions.
- `apps/server/src/provider/Layers/ProviderService.test.ts`
  - Test: saved path of file attachments is appended to the turn input text.
- `apps/server/src/provider/ModelManifest.test.ts`
  - Tests that the bundled manifest's `isLegacyModel` keeps the Claude 5 family / current Codex out of legacy.
- `apps/server/src/provider/OpenCodeServerOwner.ts`
  - Forward pack-shipped OpenCode `configContent` to the local server when non-empty.
- `apps/server/src/provider/testUtils/providerAdapterRegistryMock.ts`
  - `makeAdapterRegistryMock` helper for fork tests that need a custom adapter registry shape.
- `apps/server/src/vcs/GitVcsDriver.ts`
  - Delegate checkpoint `git add` to `t3team-GitVcsDriverCheckpointIndex.indexCheckpointPaths`.
- `apps/server/src/vcs/GitVcsDriver.test.ts`
  - Test: `execute` preserves redacted stderr in `GitCommandError`.
- `apps/server/src/vcs/GitVcsDriverCore.ts`
  - Retain redacted, capped (4 KB) stderr on `GitCommandError`.
- `apps/server/src/vcs/GitVcsDriverCore.test.ts`
  - Assert stderr is retained but redacted of argument values.
- `apps/server/src/vcs/VcsProcess.ts`
  - Redact command-arg values from stderr before it leaves the process boundary.
- `apps/server/src/vcs/VcsProcess.test.ts`
  - Tests: auth-failure and rate-limit classification without retaining the credential.
- `apps/web/src/components/files/FileBrowserPanel.tsx`
  - Windows ClearType weight pin (Segoe UI Light at 12px) + tree CSS variable overrides (nexi-distribution #195).
- `apps/web/src/components/preview/previewAutomationErrors.ts`
  - `PreviewAutomationHostTargetLostError` + aborted/target-closed cause classification.
- `apps/web/src/components/threadSidebarWidth.ts`
  - Re-export `THREAD_SIDEBAR_DEFAULT_WIDTH` for the fork's t3team tests.
- `apps/web/src/lib/attachmentUploadQueue.test.ts`
  - Explicit-key call sites (`image: image`) in the upload-queue tests.
- `apps/web/src/localApi.ts`
  - `__resetLocalApiForTests` reset hook.
- `apps/web/src/rpc/atomRegistry.ts`
  - `resetAppAtomRegistryForTests` so fork tests can rebuild the app atom registry.
- `apps/web/src/state/query.ts`
  - `useEnvironmentQueryData` helper for environment-scoped queries.
- `apps/web/src/state/terminalSessions.ts`
  - Select known terminal sessions per environment/thread from the query data.
- `apps/web/src/state/threads.ts`
  - Export the app-level `threadEnvironment` atom instance.
- `packages/contracts/src/assets.ts`
  - Attachment mime union: images keep the allow-list, arbitrary files accept any valid RFC 6838 type; cap is `MAX_FILE_BYTES`.
- `packages/contracts/src/assets.test.ts`
  - Tests: deferred image-mime validation, generic-mime arbitrary files.
- `packages/contracts/src/git.ts`
  - Optional redacted `stderr` on `GitCommandError`, surfaced in `toDetail`.
- `packages/contracts/src/orchestration.test.ts`
  - Tests: `thread.turn.resume` decodes through both command unions; file attachments alongside images.
- `packages/contracts/src/vcs.ts`
  - `VCS_PROCESS_STDERR_CAP` + `truncateVcsProcessStderr` for the capped stderr above.
- `packages/effect-codex-app-server/src/schema.test.ts`
  - Fixture item: `subAgentActivity` ACP schema sample.
- `packages/shared/src/git.ts`
  - `redactCommandArgs`: redact secret-bearing git args echoed in stderr.
- `packages/shared/src/git.test.ts`
  - Tests for `redactCommandArgs` (option values, bare values, plain args).
- `packages/shared/src/model.ts`
  - Restored `resolveModelSlug`/`resolveModelSlugForProvider`/`trimOrNull`: t3team `start_child` model resolution needs provider-default fallback upstream's `resolveSelectableModel` does not expose.
- `packages/shared/tsconfig.json`
  - Exclude the browser voice-input modules (`t3team-voiceInput*`) from Effect-lint scope; apps typecheck them under their own configs.
- `scripts/lib/cli-external-packages.ts`
  - Declare `@silvia-odwyer/photon-node` external: its wasm sidecar cannot be inlined by the CLI bundle (GHE #307).
- `scripts/lib/cli-external-packages.test.ts`
  - Expect the photon-node entry in the external-packages list.
- `vite.config.ts`
  - Vitest excludes `**/worktrees/**`: agent worktrees nest this repo and their test copies fail at import.

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
