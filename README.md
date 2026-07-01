# T3 Code

This is our fork of T3 Code. Upstream T3 Code is a minimal web/desktop GUI for coding
agents; this fork adds **t3work** on top.

**t3work** is a team-based, project-aware agentic shell. The premise is simple: teams do
not need another loose AI chat. They need one managed workbench where engineers, PMs,
designers, QA, support, and managers share project context, use role-aware recipes, and
review external writes before they happen.

Core stays lean: agent runtime, providers, permissions, persistence, workflows, safe UI
blocks, and pack loading. Product opinion comes from **packs**: versioned bundles for
connectors, views, recipes, profiles, themes, policies, provider integrations, and project
sync.

Examples: a GitHub pack makes it a PR/repo workbench; an Atlassian pack makes it a
Jira/Confluence workbench; an enterprise pack can add internal systems, branded UI,
approved providers, role-based workflows, and locked policy.

Current state:

- local-first web/desktop shell
- provider support for Codex, Claude, Cursor, and OpenCode
- project and session UI for working with coding agents
- early `t3work` experiments for team/project-oriented work surfaces

This repository is still very early. Expect rough edges.

Detailed working spec: [`docs/t3work-mvp`](./docs/t3work-mvp).

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
