# T3 Code

This is our fork of T3 Code. Upstream T3 Code is a minimal web/desktop GUI for coding
agents; this fork adds **t3team** on top.

**t3team** is a team-based, project-aware agentic shell. The premise: teams do not need
another loose AI chat — they need one managed workbench where engineers, PMs, designers,
QA, support, and managers work from the same project context, use role-aware profiles and
team-approved recipes instead of writing perfect prompts, and review external writes
before they happen.

The core stays small and boring: agent runtime, providers, tool/permission broker,
persistence and sync, workflow engine, safe UI blocks, pack loading. Product opinion comes
from **packs** — versioned bundles of connectors, views, recipes, profiles, themes,
policies, provider integrations, and project sync:

- a GitHub pack makes it a PR/repo workbench
- an Atlassian pack makes it a Jira/Confluence project workbench
- an enterprise pack makes it your internal branded work app — custom systems, approved
  providers, role-based workflows, locked policy

Security model in one sentence: one managed platform with connector-based access and
reviewable actions, instead of many unmanaged MCP/token connections per user.

Current state:

- local-first web/desktop shell
- provider support for Codex, Claude, Cursor, Grok Build, and OpenCode
- project and session UI for working with coding agents
- early `t3team` experiments for team/project-oriented work surfaces

This repository is still very early. Expect rough edges.

> [!WARNING]
> The T3 Team rename is an intentional pre-release clean cut. It changes product-prefixed
> SQL identifiers without compatibility migrations or legacy fallback logic. Existing
> disposable local state from an earlier pre-rename build may need to be reset before using
> a renamed build; this is not a data-preserving upgrade path.

Detailed working spec and pack model: [`docs/t3team-mvp`](./docs/t3team-mvp).

## Installation

> [!WARNING]
> T3 Code currently supports Codex, Claude, Cursor, Grok Build and OpenCode. Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`
> - Claude: install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`
> - Cursor: install [Cursor CLI](https://cursor.com/cli) and run `agent login`
> - Grok Build: install [Grok Build CLI](https://x.ai/cli) and run `grok login`
> - OpenCode: install [OpenCode](https://opencode.ai) and run `opencode auth login`

### Try it out (install-free)

The easiest way to test T3 Code is to run the server in your terminal (requires Node.js 22.16+, 23.11+, or 24.10+):

```bash
npx t3@latest
```

This will launch T3 Code's backend on your machine as well as the local web app to control your agents.

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

We are (mostly) not accepting contributions yet. Small fixes may be considered. Big features will not be.

## Documentation

Full docs live in [docs/](./docs). There's no docs site yet.

- [Install and first run](./docs/user/install.md)
- [Permission modes](./docs/user/permission-modes.md)
- [Keyboard shortcuts](./docs/user/keybindings.md)
- [Remote access from a phone or another machine](./docs/user/remote-access.md)
- [Keeping app and server in sync](./docs/user/updating.md)
- [Source control integrations](./docs/user/source-control.md)
- Multiple accounts: [Codex](./docs/user/providers-codex.md) · [Claude](./docs/user/providers-claude.md)
- Linux: [run T3 Code as a background service](./docs/user/background-service.md)

Building from source? Start at [docs/internals/overview.md](./docs/internals/overview.md).

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
