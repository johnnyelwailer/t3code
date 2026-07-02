# T3 Code

This is our fork of T3 Code.

Upstream T3 Code is a minimal web GUI for coding agents. We want to keep that base and add
**t3work** on top: a team-based, project-aware agentic shell for real work.

The premise: teams do not need another loose AI chat. They need one managed workbench
where agents understand the project, roles share the same context, and integrations stay
safe.

The basic idea:

```text
T3 Code gives us the agent shell:
  - local web/desktop UI
  - projects and sessions
  - providers like Codex, Claude, Cursor, and OpenCode

t3work adds the work layer:
  - bring different roles into one shared project workspace
  - let engineers, PMs, designers, QA, support, and managers work from the same context
  - see the right work items, docs, pull requests, tickets, dashboards, and decisions
  - use role-aware profiles and team-approved recipes instead of writing perfect prompts
  - let the agent produce durable outputs and proposed changes
  - review external mutations before they happen
```

t3work is not just a better chat UI. It is a shared work surface where people and agents
operate against the same project context, with role-specific views, profiles, and
workflows.

The core app should not decide what every team’s workbench looks like. Different teams
work differently. Instead, the core ships building blocks, and **packs** shape the product.

Security model in one sentence: one managed platform with connector-based access and
reviewable actions, instead of many unmanaged MCP/token connections per user.

Example:

```text
GitHub pack
  makes t3work a pull-request and repository workbench

Atlassian pack
  makes t3work a Jira/Confluence project workbench for PM, engineering, QA, and support

Acme enterprise pack
  makes t3work Acme's internal branded work app with custom systems,
  approved agent providers, role-based workflows, and locked policies
```

This lets an individual, team, or enterprise customize the app without forking it.

Current state:

- local-first web/desktop shell
- provider support for Codex, Claude, Cursor, and OpenCode
- project and session UI for working with coding agents
- early `t3work` experiments for team/project-oriented work surfaces

This repository is still very early. Expect rough edges.

## t3work Vision

t3work should keep the core app small and boring:

- agent/session runtime
- provider adapter boundary
- tool and permission broker
- host-owned persistence and sync/cache substrate
- reviewable external mutations
- workflow engine and SDK
- safe UI building blocks
- pack loading, signing, updates, rollback, and policy merge

Everything opinionated should come from packs.

A pack is a versioned bundle that can provide:

- connectors, for example GitHub, Jira, Linear, Zendesk, or internal systems
- AI provider integrations, including custom enterprise agents
- recipes, workflows, schedules, and prompt blocks
- views, dashboards, side panels, and miniapps
- themes, terminology, profiles, and localization
- policies, provider allow/deny lists, and permission locks
- project sync providers for backup or team sharing

The package itself should contain primitives. A company or user should be able to add
their own bundle:

```text
Custom installer:
  t3work core + bundled company packs

Remote-managed setup:
  t3work core + trusted endpoint that silently syncs packs, policies, providers,
  themes, recipes, integrations, and custom extensions

Personal setup:
  t3work core + user packs for favorite providers, themes, recipes, and shortcuts
```

## Pack Model

This model is being specified now. It is not all implemented yet.

Target behavior:

- packs can be installed globally, bundled with an installer, attached to a project, owned
  by a user, or synced from a trusted remote endpoint
- packs are trusted once installed or attached
- pack code still crosses host-owned boundaries for tools, permissions, persistence, sync,
  and external writes
- GitHub is a normal default pack, not privileged core behavior
- Atlassian/Jira is a proof pack and connector boundary, not the core product shape
- screens such as Backlog, My Work, Standup, and Capacity are pack-provided views
- installed pack code lives in app data, not copied into every project workspace
- user-created state is private until promoted into a project-shared layer
- project-shared state can be synced by a pack-provided project sync provider

The detailed working spec lives in [`docs/t3work-mvp`](./docs/t3work-mvp).

## What Works Today

Use T3 Code as an agent shell. Install and authenticate at least one provider, then run the
web app or desktop app.

The t3work pack platform is under active design and implementation. Some pieces exist as
MVP/proof work in the repo, especially around project surfaces, recipes, GitHub/Jira-style
workflows, and additive host integration.

## Installation

> [!WARNING]
> T3 Code currently supports Codex, Claude, Cursor, and OpenCode.
> Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`
> - Claude: install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`
> - Cursor: install [Cursor CLI](https://cursor.com/cli) and run `cursor-agent login`
> - OpenCode: install [OpenCode](https://opencode.ai) and run `opencode auth login`

### Run without installing

```bash
npx t3@latest
```

Tip: Use `npx t3@latest --help` for the full CLI reference.

### Desktop app

Install the latest version of the desktop app from [GitHub Releases](https://github.com/pingdotgg/t3code/releases), or from your favorite package registry:

#### Windows (`winget`)

```bash
winget install T3Tools.T3Code
```

#### macOS (Homebrew)

```bash
brew install --cask t3-code
```

#### Arch Linux (AUR)

```bash
yay -S t3code-bin
```

## Some notes

We are very very early in this project. Expect bugs.

We are not accepting contributions yet.

There's no public docs site yet, checkout the miscellaneous markdown files in [docs](./docs).

## Documentation

- [Getting started](./docs/getting-started/quick-start.md)
- [Architecture overview](./docs/architecture/overview.md)
- [Provider guides](./docs/providers/codex.md)
- [Operations](./docs/operations/ci.md)
- [Reference](./docs/reference/encyclopedia.md)

## If you REALLY want to contribute still.... read this first

### Install `vp`

T3 Code uses Vite+ so you'll need to install the global `vp` command-line tool.

#### macOS / Linux

```bash
curl -fsSL https://vite.plus | bash
```

#### Windows

```bash
irm https://vite.plus/ps1 | iex
```

Checkout their getting started guide for more information: https://viteplus.dev/guide/

### Install dependencies

```bash
vp i
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).
