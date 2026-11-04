# Upstream alignment

How the fork keeps its features alive through the upstream redesign stack and how future PRs stay merge-friendly against it.

**Rule of the fork (Phil, 2026-11-04):** never pause feature work; align architecturally *ahead* of the merge. Keep fingers off the files upstream is heavily rewriting; move our modifications into `t3team-*` files and leave only thin seams (one-line hooks) in hot files. Adopt upstream shapes and vocabulary early. Every line moved out of a hot file now is a conflict avoided later. Behaviour must stay identical for users.

## The upstream redesign stack (all DO NOT MERGE, still moving)

Common base with the fork: `7cf653bca6`. Fetch a stack head with `git fetch https://github.com/pingdotgg/t3code pull/<N>/head:up/<N>`.

| PR | Area | What it replaces in the fork today |
|---|---|---|
| `#28839` | shell / sidebar / titlebar | `apps/web/src/components/Sidebar.tsx` + sidebar chrome (`sidebar/SidebarChrome.tsx`, `sidebar/SidebarThreadRow.tsx`), the titlebar and shell around them |
| `#28840` | composer tray / timeline | `apps/web/src/components/chat/ChatComposer*` (if present at merge) and `chat/MessagesTimeline.tsx` + `MessagesTimeline.logic.ts` |
| `#28841` | PR / diff / file panels | `chat/RightPanelSurfaceContent.tsx`, `pullRequest/PullRequestCodeTab.tsx` |
| `#28842` | floating settings panel | `settings/SettingsPanels.tsx`, `settings/SettingsSidebarNav.tsx`, `settings/settingsSearch.ts` |
| `#28844` | voice dictation | our native-transcription path: `apps/server/src/speech` (koffi `SpeechService`), `packages/contracts/src/speech.ts`, `POST /api/voice/transcribe`, `packages/client-runtime/src/voice-input/controller.ts`, `ComposerSpeechButton`, Settings › Voice, `Mod+Alt+V`. Speech-to-text only — **no text-to-speech**. Voice seams here are owned by the voice-seams thread; this doc only references the contract. |
| `#28845` | workspace panes | `apps/web/src/layout/` — `layoutModel.ts` (workspaces → columns → panes → tabs), `layoutStore.ts` (zustand, localStorage `t3code:layout-state:v2`), `useLayoutRouteSync.ts`, `surfaceSync.ts` (bridges `rightPanelStore`); **deletes** `chat/RightPanelSurfaceContent.tsx`; **rewrites** `RightPanelTabs.tsx` and `ChatView.tsx` |

Reference copies of the #28845 files live at `D:\worktrees\upstream-redesign-notes\up\` (layoutModel.ts, layoutStore.ts, openRules.ts, surfaceSync.ts, useLayoutRouteSync.ts); the 207 fork files that overlap the stack are in `D:\worktrees\upstream-redesign-notes\both.txt`, per-PR file lists in `up\files-<PR>.tsv`.

## Hot files — what a fork PR may and may not do

A hot file is one the stack rewrites or heavily rewrites. In a hot file, fork PRs add **thin hooks only**: a one-line import plus a one-line call. No new logic, no new state, no new branches. New fork behaviour lives in a `t3team-*` file; the hot file only calls into it.

Warning-only enforcement: `scripts/t3team-hot-file-check.mjs` (local) and the PR Size workflow step (CI) flag a PR that adds more than 30 lines to a hot file. They never fail a build; they surface the seam decision early.

| Hot file (fork line count @ 2026-11-04) | Rule | Fork logic home (the `t3team-*` seam) |
|---|---|---|
| `apps/web/src/components/ChatView.tsx` (~4.2k) | no new logic; extend via the existing `ChatViewT3TeamExtensionProps` / banner-item hooks only | `apps/web/src/t3team/chat/*` (`t3team-chatViewExtensions.ts`, `t3team-useChatTimelineProps.ts`, `t3team-useTimelineArtifacts.ts`, banner items); surfaces: `apps/web/src/t3team/layout/*` |
| `apps/web/src/components/RightPanelTabs.tsx` (~1.5k) | one-line hooks; tab chrome stays upstream-shaped | `apps/web/src/t3team/detached/*` (`t3team-openDetachedSurface.ts`, `t3team-rightPanelSurfaceDetach.ts`), surface registry `apps/web/src/t3team/layout/*` |
| `apps/web/src/rightPanelStore.ts` (~1.4k) | fork surface kinds are registered data, not inline branches | surface registry `apps/web/src/t3team/layout/*`; PR view state `components/pullRequest/t3team-prDetailViewState.logic.ts` |
| `apps/web/src/components/Sidebar.tsx` (~3.4k) | slots/hooks only; row chrome and rosters stay upstream-shaped | `~/t3team/components/t3team-InboxSlots.tsx`, `~/t3team/hooks/*`, `~/t3team/t3team-threadNavigationOverride.ts`, `~/t3team/t3team-childThreadRelationsStore.ts`, voice row `~/t3team/voice/*` |
| `apps/web/src/components/chat/MessagesTimeline.tsx` + `.logic.ts` (~4.6k total) | timeline entries join through the artifact hook, never inline | `~/t3team/chat/*` (`t3team-useTimelineArtifacts.ts`) |
| `apps/web/src/components/pullRequest/PullRequestCodeTab.tsx` (~1.9k) | PR detail state stays in its t3team logic file | `components/pullRequest/t3team-prDetailViewState.logic.ts` |
| `apps/web/src/components/sidebar/SidebarChrome.tsx`, `SidebarThreadRow.tsx` | no new forks in row chrome | `~/t3team/t3team-threadStatusPillTypes.ts`, `~/t3team/t3team-threadIconPicker.tsx` |
| `apps/web/src/index.css` (~3.4k) | no new rules in the hot stylesheet | the per-feature `~/t3team/t3team-index-*.css` files |
| `apps/web/src/components/settings/SettingsPanels.tsx`, `SettingsSidebarNav.tsx`, `settingsSearch.ts` | sections are registered data, not inline JSX | settings registry `~/t3team/settings/*` (see below) |
| `packages/contracts/src/settings.ts`, `ipc.ts` | fork keys under the `t3team.` prefix, added in our own schema file, minimal seam only | `packages/contracts/src/t3team-settings.ts` (see below) |
| `packages/client-runtime/src/voice-input/controller.ts` | voice is upstream #28844's shape; no fork parallel | owned by the voice-seams thread (T2); reference only |

Line counts drift; treat the list as the contract and the numbers as a snapshot.

## Upstream target shapes we mirror

### Layout surfaces (#28845 vocabulary)

Upstream models the workspace as `workspaces → columns → panes → tabs`. Tab content is serializable:

- `chat` — a thread (`ThreadRouteTarget`: server thread ref or draft id)
- `launcher` — `{ id, context }`
- `pull-requests` / `settings` / `usage` — page content
- `surface` — `{ threadRef, surfaceId }` for diff, files, file, browser, terminal, pull request, device; the surface's content lives in `rightPanelStore` and `surfaceSync.ts` keeps tabs and store in step.

The fork registers **our** surfaces in a `t3team` namespace so they survive the rewrite as data, not as branches: a serializable `{ kind, id, params }` where `kind` is `t3team.<surface>` — e.g. `t3team.context-chat` (My Work context chat pane), `t3team.thread` (side chat / peer thread surface). Registration lives in `apps/web/src/t3team/layout/*`; the registry is the single source of truth for what fork surfaces exist, their params schema, and which component renders them. When #28845 lands, `surfaceSync` maps `t3team.*` kinds onto upstream surface tabs and our components render unchanged.

### Voice (#28844 contract, reference only)

`apps/server/src/speech` `SpeechService` (koffi) → `POST /api/voice/transcribe` → `packages/contracts/src/speech.ts` → `packages/client-runtime/src/voice-input/controller.ts` → `ComposerSpeechButton` (ghost preview in the draft), Settings › Voice, `Mod+Alt+V`. No TTS. The fork's desktop engine work (#570) plugs in as engines under this contract; the seams are tracked by the voice-seams thread — do not duplicate that work.

### Settings as data

Settings sections and rows are registry entries `{ section, key, label, component, searchTerms }`, rendered and searched by a thin hook in `SettingsPanels` / `SettingsSidebarNav` / `settingsSearch`. Fork keys live under the `t3team.` prefix in our own schema file (`packages/contracts/src/t3team-settings.ts`); `settings.ts` carries only the minimal seam, and existing persisted keys stay readable (migration/alias, never lose a stored value). This is what lets #28842's floating settings panel render our sections without our sections being inline JSX.

## Checklist for fork PRs touching these areas

1. Is a hot file in the diff? If so: ≤ 30 added lines, one-line hooks only, logic in a `t3team-*` file. Run `node scripts/t3team-hot-file-check.mjs` and read the output.
2. New right-panel surface or tab? Register it in `apps/web/src/t3team/layout/*` with a `t3team.*` kind and serializable params — never a new inline branch in `rightPanelStore` / `RightPanelTabs` / `ChatView`.
3. New setting? Register it through the settings registry with a `t3team.` key; never a new inline row in the settings hot files.
4. New CSS? Per-feature `t3team-index-*.css`, not `index.css`.
5. Does the change assume an upstream file shape that #28839–#28845 are about to rewrite? Re-read this doc's stack table; if the shape will move, build on the seam, not the shape.
6. Before pushing: `git merge origin/main` (other threads touch these files too — voice composer fixes, sidebar device pills) and keep both intents.

## Hardest conflicts and seams proposed by the shadow-rebase report

_(follow-up commit from the "fork: shadow rebase onto upstream redesign stack (report only)" thread)_
