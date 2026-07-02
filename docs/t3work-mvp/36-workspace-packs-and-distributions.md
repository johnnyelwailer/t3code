# Epic 36: Workspace Packs And Distributions

## Purpose

Make `t3work` pack-driven.

The core package should contain runtime primitives and safety rails. Workspace-specific
opinion should come from versioned packs that can be installed globally, synced from a
remote endpoint, applied to a single project, or bundled with a custom distribution.

This epic turns workspace-specific behavior into a first-class product and technical
model.

## Definitions

### Pack

A **pack** is the generic unit of product shaping. It is a versioned bundle of code,
configuration, assets, and policy.

`workspace pack` remains valid when the pack applies to a workspace configuration, but
the broader concept is just "pack".

### Extension Module

An **extension module** is one capability inside a pack.

Examples:

- connector module
- AI provider integration module
- recipe module
- workflow module
- view/miniapp module
- theme or locale asset
- policy module
- persistence schema module
- project sync provider module

Use "pack" for the versioned bundle. Use "module" for the individual thing the pack
contributes.

### Workspace Pack

A **workspace pack** is a pack resolved into an effective workspace configuration.

It may provide:

- connectors for work systems
- AI provider integrations
- tool groups and tool definitions
- workflows, recipes, prompt blocks, and schedules
- views and miniapps
- profiles and profile sets
- themes, terminology, layout defaults, and density defaults
- localization resources
- policy defaults and lock rules
- artifact templates and renderers

### Distribution

A **distribution** is an installer/build/channel that ships core `t3work` plus zero or
more bundled packs.

Example:

```text
t3work-desktop
  core runtime
  github default pack

acme-workbench
  core runtime
  acme-global workspace pack
  acme-support pack
  acme theme and provider policy
```

### Remote Pack Endpoint

A **remote pack endpoint** is a small signed update source for pack manifests and pack
archives. It should not become a required admin SaaS before the pack sync contract is
proven.

## Scope

In scope:

- pack manifest model
- pack scopes and merge order
- lockable override model
- install locations
- remote endpoint v0
- signed archives and hash validation
- pack-provided connectors, providers, views, recipes, themes, locales, and policies
- relationship to existing project-local recipes and miniapps

Out of scope for v1:

- public marketplace
- hosted admin console
- payment/licensing
- arbitrary dependency installation inside project workspaces
- making remote endpoint APIs responsible for behavior that can be built as normal packs

## Pack Scopes

Packs may apply at several scopes:

```ts
type WorkspacePackScope = "distribution" | "global" | "user" | "project" | "remote-managed";
```

Meaning:

- `distribution`: bundled with the installed app.
- `global`: installed on the machine or tenant for all users/workspaces.
- `user`: personal pack for one user across workspaces.
- `project`: applies to one project workspace.
- `remote-managed`: synced from a remote endpoint and controlled by an organization.

The host resolves all active packs into one effective workspace configuration.

## Merge And Override Model

Default merge order, low to high:

1. core defaults
2. distribution packs
3. global packs
4. user packs
5. project packs
6. remote-managed packs
7. explicit locks

Default stance:

```text
Everything is overridable unless a higher-precedence policy locks it.
```

Examples:

```text
User pack can replace theme from distribution pack.
Project pack can add recipes to company pack.
Remote-managed pack can lock provider allowlist.
Remote-managed pack can force a profile selection.
```

Merge should be deterministic and explainable. The UI must be able to answer:

```text
Why is this provider disabled?
Source: acme-global@1.4.0 locked aiProviders.allowed to ["codex-enterprise"].
```

## Lock Model

Any configurable pack field can be lockable, but common locks should be first-class:

```ts
type WorkspacePackLock =
  | { target: "aiProviders.allowed"; mode: "replace"; value: string[] }
  | { target: "aiProviders.denied"; mode: "append"; value: string[] }
  | { target: "connectors.allowed"; mode: "replace"; value: string[] }
  | { target: "tools.policy"; mode: "merge"; value: ToolPolicyRules }
  | { target: "profiles.selection"; mode: "replace"; value: ProfileSelection }
  | { target: "themes.active"; mode: "replace"; value: string }
  | { target: "views.nav"; mode: "replace" | "append"; value: string[] }
  | { target: "recipes.enabled"; mode: "replace" | "append"; value: string[] }
  | { target: string; mode: "replace" | "append" | "merge"; value: unknown };
```

Locks are policy, not UI hints. Enforcement belongs in the host backend and shared policy
engine.

## Manifest

Pack manifests are declarative and reviewable before activation.

```ts
type WorkspacePackManifest = {
  id: string;
  version: string;
  packApiVersion: 1;
  name: string;
  description?: string;
  publisher?: string;
  scope?: WorkspacePackScope;
  compatibility: {
    t3workCore: string;
    hostCapabilities?: string[];
  };
  entrypoints?: {
    activate?: string;
    deactivate?: string;
  };
  contents: {
    connectors?: PackModuleRef[];
    aiProviders?: PackModuleRef[];
    tools?: PackModuleRef[];
    workflows?: PackModuleRef[];
    recipes?: PackModuleRef[];
    views?: PackModuleRef[];
    profiles?: PackModuleRef[];
    persistence?: PackModuleRef[];
    projectSyncProviders?: PackModuleRef[];
    themes?: PackAssetRef[];
    locales?: PackAssetRef[];
    policies?: PackAssetRef[];
    artifactRenderers?: PackModuleRef[];
  };
  capabilities: string[];
  locks?: WorkspacePackLock[];
  hashes: Record<string, string>;
  signature?: string;
};

type PackModuleRef = {
  id: string;
  path: string;
  exports?: string[];
};

type PackAssetRef = {
  id: string;
  path: string;
};
```

The manifest is not the whole programming model. Code modules still use typed SDK helpers
such as `defineConnector`, `defineRecipe`, `defineProfile`, `defineProjectView`,
`defineTool`, `definePersistenceSchema`, `defineProjectSyncProvider`, and
`defineAiProviderIntegration`.

## Persistence Model

Packs should not create arbitrary independent local databases by default.

The host owns physical persistence:

- pack installation and activation records
- settings, profiles, policy state, and lock state
- connector sync cache and normalized resource snapshots
- workflow run journals and durable step state
- artifacts and rendered artifact metadata
- view/miniapp state
- project bindings and project sync status
- audit records

Packs may contribute logical schemas and stores through the SDK:

```ts
definePersistenceSchema({
  id: "acme-support.caseMetadata",
  version: 3,
  scope: "project",
  tables: {
    caseFlags: {
      key: "resourceRef",
      columns: {
        resourceRef: "resource-ref",
        severityBucket: "string",
        lastEscalatedAt: "datetime?",
      },
      indexes: ["severityBucket", "lastEscalatedAt"],
    },
  },
  migrations: ["./migrations/001-init.ts", "./migrations/002-severity.ts"],
});
```

Rules:

- the host runs migrations, not pack code directly against a raw database handle
- every table/store is namespaced by pack id and schema id
- migrations are versioned, signed with the pack, auditable, and rollback-aware
- packs use host query/write APIs so policy, encryption, export, backup, retention, and
  transactions stay centralized
- connector modules write normalized snapshots into host stores, then views/recipes read
  queryable context from those stores
- external databases are integration targets, not local app state, unless a trusted pack
  explicitly requests and receives an external-storage capability

This keeps core useful without turning every pack into its own persistence platform.

Example:

```text
Atlassian pack
  contributes Jira connector
  contributes Jira resource schema
  writes issue snapshots into host SQL
  stores Jira-specific derived fields in a namespaced pack table

Core host
  owns SQL file
  owns migrations table
  owns backup/export
  owns policy and audit
```

## State Scopes

Project workspaces need several state layers. Do not collapse them into one folder.

```text
local-ephemeral
  run scratch, temporary build output, transient provider files
  never synced

user-private
  personal auth, preferred theme, hidden/pinned UI, personal recipes, drafts
  synced only through a user-owned mechanism

project-local
  files/context for this local project copy
  may be backed up, but not automatically shared with teammates

project-shared
  team-owned recipes, workflows, views, project settings, project docs
  may sync to a shared remote through a project sync provider

pack-managed
  distribution/global/remote-managed pack code and config
  updated through pack install/update channels

org-managed
  tenant policy, locks, remote-managed packs
  can override lower layers when attached and trusted
```

Default sharing rule:

```text
User-created state is private until the user or policy promotes it.
Project-shared state is explicit and reviewable.
Caches, secrets, provider homes, and raw connector mirrors are never shared by default.
```

### Promotion Flow

Example: user A creates a useful release-checklist recipe.

1. It starts as `user-private`.
2. User A chooses "Share with project".
3. The host creates a reviewable change set containing the recipe module, required
   capabilities, source attribution, and any new project policy defaults.
4. If approved, it becomes `project-shared`.
5. If a project sync provider is active, the shared layer is pushed to the team remote.
6. Teammates receive it as project-shared state, subject to their org/user policy.

Conflict handling must show source and precedence:

```text
release-checklist recipe
  project-shared: acme-mobile project
  overridden by: acme-global remote pack lock disabling external deploy tools
```

## Project Workspace Sync

Core should provide the state model and sync hooks. Packs should provide remote adapters.

A **project sync provider** is a pack module that can back up or share the project-shared
layer. Git can be the transport, but the product should describe it as project backup or
team sync for nontechnical users.

Examples:

```text
github-default pack
  project sync provider: private GitHub repo or branch

acme-enterprise pack
  project sync provider: personal GHE repo, team GHE repo, or internal endpoint

local-only distribution
  no project sync provider
```

The host owns what is syncable:

- project-shared recipes, workflows, views, docs, and settings
- explicit project manifests such as `t3work.project.json`
- small references to required packs and versions
- non-secret project context authored by the user/team

The host excludes by default:

- secrets and auth tokens
- provider home directories
- run scratch and transient logs
- raw connector mirror tables
- pack archives and remote-managed executable code
- user-private preferences and drafts

Autosync should be opt-in for unmanaged users and policy-driven for managed deployments.
Creating a remote repository, branch, or endpoint binding is an external mutation and
therefore uses the reviewable mutation flow unless a trusted admin policy pre-authorizes
it.

Useful v1 behavior:

```text
No remote:
  project works local-only.

User enables backup:
  project sync provider creates private repo/branch and pushes project-shared layer.

Team enables sharing:
  project sync provider pushes project-shared layer to team repo/endpoint.

Admin-managed workspace:
  remote-managed pack can require sync provider and lock destination policy.
```

The UI should expose plain status:

```text
Project sync: On
Destination: Acme GitHub Enterprise / team-workbench / project-123
Last synced: 2 minutes ago
Shared items: 4 recipes, 2 views, 1 project policy file
```

## Install Locations

Remote, global, user, and distribution packs should not install into project workspaces.
Project workspaces should contain project-specific context and explicit project-local
authored code only, not installed pack code copied silently into every repo.

Pack install layout:

```text
<app-data>/t3work/packs/
  distribution/
  global/
  remote/<endpoint-id>/
  cache/

<app-data>/t3work/users/<user-id>/packs/
  personal/
```

Project workspaces may still hold:

- project-local recipes, views, and workflows when the project explicitly owns them
- project context and synced source snapshots
- small manifests that reference globally installed packs

Recommended target:

```text
<app-data>/t3work/projects/<project-id>/
  context/
  local-source/
  runs/
  pack-bindings.json

<project-workspace>/
  t3work.project.json   # optional explicit repo-owned binding/manifest
```

Current specs and code still mention `.t3work/...` for project-local recipes, miniapps,
context snapshots, provider homes, and run files. Treat that as a transitional storage
spelling, not the desired product boundary. The target is host-owned app-data for generated
or synced state, with a visible repo file only when the project intentionally owns t3work
configuration or source.

If current features require files inside the project workspace, prefer exposing those
capabilities through MCP/tools and host APIs rather than copying remote pack code into the
project.

## Remote Endpoint v0

Keep the endpoint small.

```text
GET /manifest.json
GET /channels/:channel
GET /packs/:packId/:version/archive
GET /packs/:packId/:version/signature
```

`/manifest.json` returns available packs, current channels, revoked versions, and endpoint
metadata.

`/channels/:channel` resolves channel names to concrete pack versions.

Pack archive downloads are content-addressed by manifest hash and verified before
activation.

Example channel response:

```json
{
  "channel": "stable",
  "packs": [
    {
      "id": "acme-support",
      "version": "1.8.2",
      "archiveSha256": "..."
    }
  ]
}
```

## Updates

Default remote-managed behavior:

```text
Silent download, verify, activate on next safe boundary for trusted remote endpoints.
```

Safe boundaries:

- app restart
- no active provider sessions
- before opening a managed workspace
- explicit admin/user "reload packs" action

If a trusted remote endpoint ships new capabilities or tighter locks, the host records the
change in pack details and the audit log, then activates at the next safe boundary. Trust is
endpoint-level; capability changes are part of the trusted update stream. Unmanaged
user/project packs require local approval before activation.

Rollback must keep at least the last known-good version per endpoint.

## Trust And Capability Checks

Pack code can be powerful, so every module type must cross host-owned boundaries:

- connector reads/writes use integration contracts and sync/cache APIs
- external writes use draft/approve/commit
- views use declared placements and capabilities
- workflows launch only after capability policy passes
- tool calls cross the tool broker
- AI provider integrations cannot bypass provider/tool policy

Activation flow:

1. Download or discover pack.
2. Validate manifest shape.
3. Verify hashes and signature when required.
4. Check core compatibility.
5. Show or record requested capabilities.
6. Merge policy and locks.
7. Activate modules.
8. Store activation record for audit and rollback.

## Relationship To Existing Specs

- [Vision](./00-vision.md) becomes pack-driven: Sources and Surfaces remain concepts, but
  packs deliver them.
- [Epic 04: Integration Platform](./04-integration-platform.md) defines connectors, which
  become pack-provided modules.
- [Epic 12: Profiles And Skill Packs](./12-profiles-and-skill-packs.md) remains valid, but
  skill packs become one content type inside workspace packs.
- [Epic 16: Action Recipes](./16-action-recipes.md) defines recipes and workflows, which
  may be project-local, user-local, distribution-pack, or remote-managed pack modules.
- [Epic 19: Workspace Miniapps](./19-workspace-miniapps.md) defines views, which become
  pack-provided UI modules.
- [Epic 31: Composable Project Views](./31-composable-project-views.md) remains the block
  model for pack-provided project pages such as Backlog.
- [Epic 32: Project Provider And Tool Policies](./32-project-provider-tool-policies.md)
  becomes the enforcement layer for pack-provided policy and locks.
- Project sync providers use the same reviewable mutation and policy model as external
  connector writes when they create repositories, branches, or endpoint bindings.

## MVP Slice

1. Define pack manifest schema and loader.
2. Support distribution, global, user, remote-managed pack discovery plus project-local
   authored recipe/view/workflow discovery.
3. Add merge order and lock evaluation.
4. Move starter skill packs behind the pack abstraction even if their source still lives
   in-repo temporarily.
5. Treat Atlassian/Jira backlog UI as a candidate external pack boundary, not core.
6. Add a remote endpoint spike with manifest + archive + signature verification.
7. Show effective pack sources in diagnostics/settings.
8. Gate pack-provided tools, views, workflows, connectors, and providers through existing
   policy/tool-broker paths.
9. Add host-owned namespaced persistence schemas for pack modules.
10. Add project-shared state plus a project sync provider interface.

## Working Decisions

These are the current spec defaults until changed:

- **Naming posture:** use "pack" as the generic technical term. Use "workspace pack" only
  when the pack is resolved into a workspace-scoped configuration.
- **Core posture:** core ships little to no product opinion. GitHub ships as a normal
  default pack, not as privileged core behavior.
- **Atlassian posture:** Atlassian/Jira is the first proof pack/connector boundary, not
  core product shape.
- **Backlog posture:** backlog, My Work, standup, capacity, and similar work-management
  surfaces are pack-provided. They may live in temporary distribution/core registries only
  while the pack loader catches up.
- **Override posture:** everything is overridable by default; managed packs can lock any
  field.
- **Remote endpoint trust:** trust may be established by identity/tenant policy, user action,
  installer/distribution, or MDM/admin policy. Enterprise identity such as Entra is the
  likely primary path. Admin-managed trust can force or override effective configuration
  only when the workspace is explicitly attached to that remote endpoint.
- **Update posture:** trusted remote updates may silently download and activate at safe
  boundaries after signature and hash verification, including updates that add capabilities,
  executable entrypoints, or stronger locks. Audit records must show what changed.
- **Install posture:** remote/global pack code installs into app-data pack locations, not
  project workspaces. Project workspaces keep only project-local authored code, small
  references to installed packs, and project context.
- **Trust posture:** packs are assumed trusted once installed or attached. Pack code is
  allowed, but every capability still crosses host-owned policy, tool, sync/cache, and
  reviewable mutation boundaries.
- **Persistence posture:** core owns the physical database, migration runner, backup,
  export, retention, encryption, and audit. Packs contribute namespaced schemas,
  migrations, and query/write modules through host APIs.
- **AI provider posture:** packs may whitelist, deny, configure, or add AI/code-agent
  provider integrations. The host owns enforcement and install/auth flows.
- **Project workspace posture:** packs do not install into project workspaces. Project
  workspaces may hold explicit project-local authored code and references to installed
  packs, but not installed pack archives or remote-managed executable code.
- **Project storage posture:** `.t3work` is transitional. Prefer host app-data keyed by
  project id for generated/synced state and optional explicit repo manifests for
  project-owned configuration.
- **Repo binding posture:** if a repo needs to own t3work configuration, use a visible
  `t3work.project.json` file. Do not introduce a new hidden project directory as the target
  storage model.
- **Project sync posture:** project sync is a core state model plus pack-provided remote
  adapters. Git may be the transport, but the user-facing concept is backup/team sync.
- **Sharing posture:** user-created recipes, workflows, views, and settings are private
  until promoted. Team-visible project state lives in an explicit project-shared layer.
  Secrets, caches, provider homes, raw mirrors, and pack archives are excluded from sharing
  by default.
- **Hot reload posture:** data-only and UI-adjacent content can hot-reload first: themes,
  locale strings, terminology, recipe metadata, profiles, and view registrations. Connector
  modules, AI provider integrations, workflow engine code, and policy locks reload only at
  safe activation boundaries.
- **Typed lock posture:** v1 should type the common policy targets
  (`aiProviders.*`, `connectors.*`, `tools.policy`, `profiles.selection`, `themes.active`,
  `views.nav`, `recipes.enabled`, `locales.active`) and keep a generic lock target escape
  hatch for pack-specific fields.
- **Authoring runtime posture:** server-side pack modules should use the same trusted
  TypeScript authoring subset as recipes: ESM, erasable type annotations, interfaces/type
  aliases, generics, `import type`, relative imports within the pack, `node:` built-ins, and
  host SDK imports. Decorators, `enum`, runtime namespaces, parameter properties,
  CommonJS, tsconfig path aliases, and package imports requiring install are out of v1.
  Views remain the exception: `.tsx` is compiled by the view runtime.

## Remaining Research

None in the pack model at this point. Remaining unknowns are provider capability research
and implementation sequencing.
