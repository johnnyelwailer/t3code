# t3work Vision — A Pack-Driven Work Platform

## In One Paragraph

`t3work` is a team-based, project-aware agentic shell layered on top of T3 Code. It brings
different roles into one shared work surface: engineers, PMs, designers, QA, support, and
managers can work from the same project context with role-specific views, recipes, and
policies. The core package stays deliberately small: runtime, SDK, policy enforcement,
sync/cache plumbing, reviewable mutations, and safe UI building blocks. The actual product
shape comes from **packs**: versioned bundles that can provide connectors, AI provider
integrations, profiles, recipes, workflows, views, themes, terminology, localization, and
policy defaults. A pack may apply globally, to a user, to an organization, or to one
project workspace. Packs can ship with an installer, live in a trusted local location, or
sync silently from a remote endpoint.

## The Shift

The earlier MVP reads as a guided Jira/QA assistant. That is useful proof material, not
the product boundary.

New posture:

- Core `t3work` is **building blocks**, not an opinionated work app.
- `t3work` is a **shared team shell**, not just a better one-person chat UI.
- Roles such as engineering, product, design, QA, support, and management should share
  project context while seeing role-appropriate surfaces.
- Atlassian/Jira is **a pack or connector distribution**, not core product shape.
- Backlog, My Work, Standup, and similar screens are **views supplied by packs**, not
  privileged core pages.
- Profiles, recipes, connectors, themes, localization, and policies are all
  **pack-provided declarations or code modules**.
- A company can make `t3work` feel like its own internal work app without forking the
  shell.

GitHub should ship as a normal default pack because it is deeply tied to developer
workspaces and T3 Code itself. It should use the same pack path as everything else, with
default installation only.

## Core vs. Pack

The core package owns the parts that must be stable, boring, and security-sensitive:

| Core owns                                           | Packs provide                                  |
| --------------------------------------------------- | ---------------------------------------------- |
| Agent/session runtime and provider adapter boundary | Custom AI provider integrations                |
| Tool broker and permission checks                   | Tool groups and provider-specific tools        |
| Sync/cache contracts and local query substrate      | Connectors and resource normalization          |
| Reviewable mutation protocol                        | Domain-specific draft/commit flows             |
| Workflow engine and SDK                             | Recipes, workflows, schedules, automations     |
| View host and safe block library                    | Nav views, sidecar sections, cards, dashboards |
| Policy merge/evaluation engine                      | Organization/project/user policy rules         |
| Pack loading, signing, versioning, rollback         | Pack contents and update channels              |
| Theme/localization substrate                        | Visual themes, terms, locale strings           |

Example:

```text
t3work core
  - knows how to host a project.navView
  - knows how to enforce tool policy
  - knows how to sync provider snapshots into SQL

acme-support pack
  - adds Zendesk + Jira connectors
  - adds Support Agent and Escalation Manager profiles
  - adds a "Ticket Queue" nav view
  - adds recipes for escalation and customer reply drafts
  - locks external writes behind approval
  - renames "work item" to "case" in supported locales
```

## Packs And Workspace Packs

A **pack** is a versioned bundle of code, configuration, assets, and policy that changes
what the shell can do and how it presents itself. A **workspace pack** is a pack resolved
into a workspace configuration.

Pack contents may include:

- connectors for external systems
- AI provider integrations such as Codex, Claude Code, OpenCode, or custom internal agents
- tool definitions and tool groups
- workflows, recipes, schedules, and prompt blocks
- views and miniapps for placements such as `project.navView`, `sidecar.section`,
  `conversation.inlineCard`, `artifact.detail`, and `modal`
- profiles and profile sets
- artifact templates and renderers
- theme tokens, logos, density defaults, and layout defaults
- terminology and localization resources
- policy defaults and lock rules

Packs can be small or transformative. A small pack may add two recipes. A large enterprise
pack may replace most navigation, force provider policy, provide custom connectors, and
turn the shell into a branded internal workbench.

## Pack Scope And Merge Order

Packs can apply at multiple levels. The host resolves them into one effective workspace
configuration.

Initial precedence, low to high:

1. **Core defaults** — minimal, mostly empty.
2. **Installer-bundled packs** — optional defaults shipped with a distribution.
3. **Global packs** — installed for all workspaces on the machine or managed tenant.
4. **User packs** — personal profiles, recipes, views, and themes.
5. **Project packs** — project-specific behavior and local workflow code.
6. **Remote managed packs** — organization-controlled packs synced from an endpoint.
7. **Explicit locks** — policy rules that prevent lower layers from overriding a field.

Default stance: everything is overridable. Managed deployments may lock anything:
providers, connectors, recipes, views, profile selection, themes, localization,
workspace defaults, update channels, and mutation policy.

Example:

```text
Core says: no default backlog.
Installer pack adds: basic GitHub PR view.
User pack adds: compact theme.
Project pack adds: local release checklist recipe.
Company remote pack adds: Jira connector, Support Queue view, provider allowlist.
Company policy locks: provider allowlist and external write approval.
User still overrides: compact theme, unless company locks theme too.
```

## Remote Pack Endpoints

A remote pack endpoint should be small at first. It is a distribution and update channel,
not a full control plane.

Minimum useful contract:

```text
GET /manifest.json
GET /packs/:packId/:version/archive
GET /packs/:packId/:version/signature
GET /channels/:channel
```

The manifest describes pack IDs, versions, compatibility, hashes, signatures, channel
membership, and revoked versions. The archive contains pack files. The host handles
install location, unpacking, validation, policy merge, rollback, and activation.

More advanced behavior should be implemented by packs through normal connectors and tools
when possible. If an enterprise later needs entitlements, audit export, or admin UI, those
can be packs backed by a connector instead of mandatory endpoint complexity.

## Trust, Code, And Sync

Packs may execute code. That is required for custom connectors, provider integrations,
views, workflows, and tools.

The safety model is not "no code." It is:

- signed pack archives for remote or managed packs
- explicit capability manifests before activation
- host-side permission checks for every tool/provider/context boundary
- sync/cache APIs that keep external data behind normalized stores
- reviewable mutations before external writes
- endpoint-level trust established by identity, user, installer, or admin policy
- silent remote updates for trusted endpoints, including new capabilities, with audit records
- local approval for unmanaged user/project packs before activation
- version pinning and rollback
- revocation for known-bad versions

Packs should use the same safe sync model planned for Atlassian: connector code writes
normalized snapshots into the host-owned local cache, views and recipes read queryable
context, and writes flow through draft/approve/commit.

## Versioning Proposal

Keep the version model solid but not heavy.

```ts
type WorkspacePackManifest = {
  id: string;
  version: string; // semver or date-based semver-compatible version
  packApiVersion: 1;
  name: string;
  publisher?: string;
  compatibility: {
    t3workCore: string; // semver range
    minHostCapabilities?: string[];
  };
  contents: {
    connectors?: string[];
    providers?: string[];
    profiles?: string[];
    recipes?: string[];
    views?: string[];
    themes?: string[];
    locales?: string[];
    policies?: string[];
  };
  capabilities: string[];
  hashes: Record<string, string>;
  signature?: string;
};
```

Channels select versions:

```text
stable -> acme-support@1.8.2
beta   -> acme-support@1.9.0-beta.3
```

Installations may pin:

```text
Acme Europe: acme-support@1.8.x
Acme US:     acme-support@stable
Project X:   acme-support@1.7.4 until migration done
```

## Sources And Surfaces Still Matter

The existing Sources/Surfaces wording remains useful, but packs become the delivery unit.

- **Sources** are still connector-provided data domains: Jira, Confluence, Linear, GitHub,
  local files, or internal systems.
- **Surfaces** are still how users work: nav views, sidecar sections, action launchers,
  cards, dashboards, and artifact renderers.
- **Packs** are how Sources, Surfaces, policies, profiles, themes, and localization are
  delivered together.

Example:

```text
Atlassian pack
  Source: Atlassian connector exposes Jira issues and Confluence pages.
  Surface: Backlog, My Work, Standup, Knowledge Workbench.
  Policies: Jira write approval, provider allowlist.
  Profiles: QA Assistant, Delivery Coordinator.
```

## Provider Integrations

"Provider" has two meanings in the broader codebase: external work-system providers and
AI/code-agent providers. In this vision, packs can supply both kinds, but specs should be
precise:

- **Connector**: work-system integration such as Atlassian, Linear, Zendesk, GitHub.
- **AI provider integration**: agent runtime integration such as Codex, Claude Code,
  OpenCode, or an internal company agent.

Managed packs may whitelist, blacklist, configure, or add AI provider integrations. Policy
evaluation remains host-owned so provider adapters cannot bypass it.

## Non-Goals

- Do not make core `t3work` a Jira, Confluence, QA, or support product.
- Do not require packs to live in this repository.
- Do not install remote pack code directly into project workspaces.
- Do not let pack code bypass host policy, tool gates, or reviewable mutation rules.
- Do not rely on prompt instructions as enforcement.
- Do not make remote endpoints a mandatory enterprise control plane before the small pack
  sync contract is proven.

## North Star

Any company, team, or individual can make `t3work` their workbench by composing packs:

- a startup ships one installer with its preferred provider, GitHub workflows, and theme
- an enterprise syncs a signed remote pack that locks providers and adds internal systems
- a project carries a local pack with project-specific recipes and views
- a user keeps a personal pack for preferred themes, profiles, and shortcuts

The core stays lean. The ecosystem carries the opinions.

## Map to the Epics

- Additive foundation — [Epic 02](./02-additive-architecture.md)
- Pack/distribution model — [Epic 36](./36-workspace-packs-and-distributions.md)
- Sources and connectors — [Epic 04](./04-integration-platform.md),
  [Epic 05](./05-atlassian-mvp.md), [Epic 26](./26-knowledge-workbench.md)
- Profiles and skill packs as pack contents —
  [Epic 12](./12-profiles-and-skill-packs.md)
- Recipes, workflows, and views as pack contents —
  [Epic 16](./16-action-recipes.md), [Epic 19](./19-workspace-miniapps.md),
  [Epic 31](./31-composable-project-views.md)
- Provider/tool policy and locks —
  [Epic 32](./32-project-provider-tool-policies.md)
- Cross-provider graph — [Epic 13](./13-resource-references.md)
- Durable execution engine — [Epic 25](./25-workflow-engine.md)
