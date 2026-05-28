# Epic 02: Additive Architecture

## Direction

The MVP should be additive in the monorepo. Use `t3work` to mark additive packages and
keep ownership obvious.

Suggested structure:

```text
apps/web/src/t3work
packages/t3work-context
packages/t3work-recipes
packages/t3work-integrations-core
packages/t3work-integrations-atlassian
packages/t3work-artifacts
packages/t3work-skill-packs
packages/t3work-t3-adapter
```

The existing `apps/web`, `apps/server`, and core packages should remain the upstream
engine. `t3work` can duplicate UI patterns, but should avoid scattering
`t3work` behavior through existing files.

## T3 Adapter Boundary

`packages/t3work-t3-adapter` is the only package allowed to depend on unstable T3
internals or deep imports.

Responsibilities:

- create/upsert T3 projects
- create managed workspace directories
- start T3 threads
- attach structured external context to a thread
- map T3 project/thread state into `t3work` state
- normalize current T3 assumptions such as `workspaceRoot`

Rule:

```text
apps/web/src/t3work -> packages/t3work-t3-adapter -> existing T3 internals
```

No other `t3work` package should deep import existing T3 internals.

## Project Context Package

`packages/t3work-context` defines the shared model.

Core concepts:

- project
- project source
- managed workspace
- external resource reference
- resource snapshot
- context attachment
- project profile
- project memory document

This package should contain schemas and deterministic helpers, not service clients.

## Integration Core Package

`packages/t3work-integrations-core` defines service-agnostic interfaces.

The first implementation is Atlassian, but the abstractions should also fit Linear,
GitHub Issues, Azure DevOps, Notion, Zendesk, and local files.

Core interface:

```ts
type IntegrationProvider = {
  id: string;
  kind: string;
  listAccounts(): Promise<IntegrationAccount[]>;
  listProjects(account: IntegrationAccountRef): Promise<ExternalProject[]>;
  listResources(input: ListResourcesInput): Promise<ResourcePage>;
  getResource(ref: ResourceRef): Promise<ResourceSnapshot>;
  search(input: IntegrationSearchInput): Promise<ResourceSearchResult[]>;
  getAvailableActions(ref: ResourceRef): Promise<IntegrationAction[]>;
  prepareMutation(input: PrepareMutationInput): Promise<PreparedMutation>;
  commitMutation(input: CommitMutationInput): Promise<MutationResult>;
};
```

## Managed Workspace

`t3work` should create a local workspace automatically when the project does
not start from a user-selected folder.

Default layout:

```text
~/Library/Application Support/T3 Code/t3work/projects/<project-id>/
  project.json
  recipes/
  sources/
  plans/
  documents/
  cache/
  memory/
  runs/
    <run-id>/
      recipe/
```

T3 can still receive a real `workspaceRoot`; the user-facing shell simply treats it as
managed implementation detail.

## Compatibility Strategy

Use stable contracts first. Use deep imports only where necessary, and only inside
`packages/t3work-t3-adapter`.

When a missing extension point becomes obvious, prefer a small upstreamable addition to
T3 over a `t3work`-specific patch.

Likely future extension points:

- project metadata beyond `workspaceRoot`
- structured context attachment
- managed workspace creation
- recipe-launched thread bootstrap
- artifact references in thread messages

## Additive Extension Pattern

`t3work` extends `t3` without forking it. The enforcement lives in the additive guard
(`.t3work-additive-guard.json`, runner `t3work-additive-guard.mjs`); the canonical
allowlist and reason log is [`docs/t3work-additive-whitelist.md`](../t3work-additive-whitelist.md).
The guard enforces three things: new files must use the `t3work-` or `t3work.` prefix
(unless they live in a whitelisted unprefixed path like `packages/project-recipes/**`);
upstream files may only be modified if they appear in `allowedModifiedFiles` _and_
auto-merge cleanly against `upstream/main`; and each new file caps at 200 LOC.

### The rule

> **For every cross-cutting concern, design a minimal optional seam in upstream and put
> all the real logic in `t3work-`-prefixed files. Do not grow the allowlist if a smaller
> seam exists.**

A seam is one of:

- **Slot prop** — an optional `ReactNode`/render-prop on an upstream component.
- **Optional field** — a single optional field on an upstream type, ideally generically
  shaped or namespaced under a `t3workExt?` key.
- **Insertion component** — a `<T3workSomething />` element rendered at one fixed point.
- **Marker key** — a reserved key inside an existing extension dictionary (e.g. a
  client-settings record).

Anything richer than these belongs in a t3work-prefixed file that the seam invokes.

### Proven examples on the allowlist

- `apps/web/src/components/ChatView.tsx` — `composerContextAttachmentSlot?: ReactNode`
  prop plus a single `onSend` read. All chip behaviour lives in `t3work-`-prefixed files.
- `apps/web/src/components/chat/MessagesTimeline.tsx` — parses an inline attachment block
  out of message text before normal rendering. Single, narrow seam.
- `apps/web/src/composerDraftStore.ts` — `contextAttachments?: ComposerContextAttachment[]`
  optional field and 3 CRUD methods.
- `apps/web/src/components/settings/SettingsPanels.tsx` — `<T3workWorkModeSetting />`
  insertion component.
- `packages/contracts/src/settings.ts` — `t3workStoredProjectsJson` /
  `t3workStoredSidebarPinsJson` reserved keys.

All of these are tiny: optional, generically-shaped, and auto-merge-safe. The complete
behaviour lives in `t3work-`-prefixed code that imports the seam.

### Applying the rule to new work

When designing an extension, ask in this order:

1. Can it live entirely in a `t3work-`-prefixed file inside a whitelisted package
   (`packages/project-recipes/**`, `packages/project-context/**`,
   `packages/integrations-*/**`, `packages/t3work-skill-packs/**`,
   `apps/web/src/routes/t3work.tsx`)? **Prefer this. No allowlist growth.**
2. If it must touch upstream, what is the smallest possible optional seam? Aim for one
   optional field, one slot, one component insertion.
3. Will the seam auto-merge against future `upstream/main` changes? If not, redesign.
4. Is the seam generically shaped (plausibly upstreamable) rather than t3work-specific?
   Generic shapes age better.
5. Each new `allowedModifiedFiles` entry needs a one-line reason in
   [`docs/t3work-additive-whitelist.md`](../t3work-additive-whitelist.md).

The 200 LOC per-file ceiling forces splitting by concern. Plan for many small focused
`t3work-`-prefixed files rather than one large file per feature.

### Worked example: three-author conversation model

The action-recipes work in [Epic 16](./16-action-recipes.md) needs a third message
**author** kind (`system`, alongside `user` and `agent`) so workflows can post first-class
conversation messages that carry interactive UI and have independent user/agent
visibility. The seam:

```ts
// packages/contracts/src/model.ts  (already on allowedModifiedFiles)
export type Message = {
  // ...existing upstream fields
  t3workExt?: T3workMessageExt; // the entire seam
};

// packages/contracts/src/t3work-message-ext.ts  (new, prefix-compliant — no allowlist entry needed)
export type T3workMessageExt = {
  author?: { kind: "system"; source?: { workflowRunId: string; stepId?: string } };
  visibleToUser?: boolean;
  visibleToAgent?: boolean;
  view?: { miniappId: string; props: Record<string, unknown> };
  status?: "live" | "completed" | "superseded";
  updatedAt?: string;
};
```

Everything else — system-message rendering, persistence, LLM-context mapping in the
provider adapters, the view-in-message renderer — lives in `t3work-`-prefixed files in
whitelisted packages. Net allowlist delta: zero new entries, one updated reason line.
