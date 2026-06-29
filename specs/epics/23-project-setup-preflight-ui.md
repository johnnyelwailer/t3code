# Epic 23: Project Setup Preflight UI

## Purpose

Design the generic front half of the `t3work` create-project wizard using the existing
T3 Code shell and UI primitives as the baseline.

This document owns the steps that happen before any source-specific setup UI:

1. Choose a project source.
2. Check which agent providers are installed and ready.
3. Choose a default provider instance and model for the managed project.
4. Install and authenticate a provider from the wizard when needed.
5. Hand off to the selected source-specific setup flow.

Atlassian is the first consumer of this preflight, but this spec must remain reusable
for later sources such as GitHub, Linear, Azure DevOps, or local managed projects.

## Relationship To Source-Specific Docs

- This doc owns `Source Choice` and `Agent Runtime Preflight`.
- Source-specific docs pick up after preflight succeeds.
- [Epic 11: Atlassian Setup UI](./11-atlassian-setup-ui.md) defines the Atlassian
  connection, site selection, Jira project selection, and confirmation screens that
  follow this preflight.

## Existing T3 Baseline

The implementation must start from these existing T3 surfaces and primitives:

- `AppSidebarLayout` for the overall shell frame.
- `Sidebar` and `ui/sidebar` primitives for left navigation.
- `SettingsPageContainer`, `SettingsSection`, and `SettingsRow` for structured setup
  pages.
- Existing provider/settings cards as the baseline for source and provider cards.
- Existing provider install/update CTA patterns.
- Existing model selection behavior and provider instance terminology.
- `Dialog`, `AlertDialog`, `Popover`, `Menu`, and `Select` for focused choices.
- `Button`, `Badge`, `Input`, `Spinner`, `Skeleton`, `Tooltip`, `Toast`, and
  `ScrollArea` for controls and states.

This is not a new design system. Copy or import the existing primitives first, then add
only the missing `t3work`-specific composition.

## Design Rules

- source-specific connection UI must start only after preflight completes or is
  explicitly skipped for a source that does not need an agent runtime
- runtime preflight must reuse the app's existing provider instance and model selection
  concepts instead of inventing a second configuration system
- install, update, and authentication flows for agent providers must be backend-managed
  orchestration surfaced through a single wizard step, not manual terminal instructions
- the project creation flow must preserve source choice and runtime choice independently
  so future integrations can reuse the same shell

## Information Architecture

### Entry Points

Project shell should expose this preflight from:

- project browser empty state
- project browser `New project` button
- integrations/settings page
- project source add button

The primary entry point for the MVP is the project browser.

### Flow Shape

Prefer an inline setup page for first-time setup and a dialog for smaller follow-up
actions.

First-time flow:

```text
Project Browser
  -> New Project
  -> Choose Source
  -> Agent Runtime Preflight
  -> Install / Authenticate Provider (if needed)
  -> Source-Specific Setup
```

Returning-user flow:

```text
Project Browser
  -> New Project
  -> Choose Source
  -> Agent Runtime Preflight
  -> Source-Specific Setup
```

If a compatible default provider and model are already installed, authenticated, and
known from recent usage, the preflight step may collapse into a short review state
rather than a full decision screen.

## Screen 1: Source Choice

Baseline:

- Existing settings/provider card style.
- Existing empty state style.
- Existing button and badge primitives.

Content:

- page title: `Create project`
- primary option for the MVP: Atlassian
- secondary options: local project, empty managed project
- disabled or future options can be shown only if visually quiet
- cards may show a short runtime summary such as `Uses your default agent setup` or
  `Choose agent next`

Source card:

- source logo or icon
- title and concise description
- source badges where applicable
- readiness hint when a source depends on a provider-specific prerequisite
- action: `Continue` or `Resume`

States:

- available
- disabled
- recommended
- last used
- blocked by missing prerequisite

## Screen 2: Agent Runtime Preflight

Show this immediately after source choice when the selected source creates a managed
project that depends on an agent runtime.

Purpose:

- check which agent providers are installed
- let the user choose a default provider instance for the project
- let the user choose a default model for that provider
- install and authenticate a provider from the same step when needed

Content:

- page title: `Choose agent setup`
- concise explanation that this selects the default runtime for recipes, runs, and
  project threads
- recommended provider cards ordered by readiness and user history
- model select shown after a provider is selected and models are known
- helper copy that this can be changed later in project settings

Provider card:

- provider label and instance label when multiple instances exist
- installed status
- authentication status
- compatible/default model summary when available
- badges such as `Recommended`, `Installed`, `Needs sign-in`, `Not installed`
- action: `Use`, `Install`, `Authenticate`, or `Retry`

Controls:

- provider choice
- model choice
- `Install`
- `Authenticate`
- `Refresh`
- `Continue`

States:

- scanning providers
- installed and ready
- installed but unauthenticated
- not installed
- installing
- authenticating
- install failed
- auth failed or cancelled
- no compatible models

## Automation Requirements

- installation and authentication start only after an explicit user action such as
  `Install` or `Continue`
- once triggered, the backend owns the install and auth orchestration end to end,
  including running provider-specific commands, polling readiness, and refreshing the
  provider list
- the wizard should not require the user to open a separate terminal, copy commands, or
  manually revisit provider settings
- when OS, browser, or provider consent is required, the wizard may hand off to that
  prompt, but must return to the same step and resume automatically
- if install completes and the provider still needs authentication, authentication
  should start from the same step without forcing the user back to source choice

## Component Inventory

New composition components likely needed:

- `ProjectSourceChoice`
- `IntegrationProviderCard`
- `AgentRuntimePreflightPanel`
- `AgentProviderCard`
- `AgentProviderInstallPanel`
- `AgentModelSelect`

These should be built from existing T3 primitives. They are compositions, not new base
controls.

## Data Requirements

### Project Source Option

```ts
type ProjectSourceOption = {
  id: string;
  provider: string;
  title: string;
  description: string;
  badges: string[];
  requiresAgentRuntime: boolean;
};
```

### Agent Runtime Provider

```ts
type AgentRuntimeProviderOption = {
  instanceId: string;
  driver: string;
  label: string;
  installed: boolean;
  authStatus: "authenticated" | "unauthenticated" | "expired" | "unknown";
  status: "ready" | "installRequired" | "authRequired" | "installing" | "authenticating" | "error";
  availableModels: AgentRuntimeModelOption[];
  installLabel?: string;
  authLabel?: string;
  statusMessage?: string;
};
```

### Agent Runtime Model

```ts
type AgentRuntimeModelOption = {
  id: string;
  label: string;
  providerInstanceId: string;
  recommended?: boolean;
};
```

### Agent Runtime Selection

```ts
type AgentRuntimeSelection = {
  providerInstanceId: string;
  defaultModelId?: string;
};
```

## Orchestration Requirements

The UI should consume normalized backend capabilities for runtime preflight instead of
hardcoding provider-specific install commands.

Required backend behaviors:

- list installed and configured provider instances with auth and model readiness state
- expose whether a provider supports one-click install, one-click auth, or both
- run install and auth workflows on behalf of the user after explicit approval
- stream progress and failure states back to the wizard step
- refresh model availability after install/auth completes
- preserve the selected provider and model while the flow refreshes

## Accessibility Requirements

- All source and provider logos need alt text.
- Source cards, provider cards, and model selectors must be keyboard navigable.
- Install, auth, loading, and error progress states must be screen-reader visible.
- Selection must be conveyed without relying on color alone.
- Buttons must use concrete verbs: `Continue`, `Install`, `Authenticate`, `Retry`.

## Storybook Requirements

Stories required before stabilization:

- source choice, default
- source choice, with readiness badges
- agent runtime preflight, scanning
- agent runtime preflight, provider ready
- agent runtime preflight, install required
- agent runtime preflight, auth required
- agent runtime preflight, install failed
- agent runtime preflight, no models

## Browser Validation Script

For every implementation change in this flow, the agent must open the app in a browser
and click through:

1. Open project browser.
2. Click `New project`.
3. Inspect source choice and choose Atlassian.
4. Inspect agent runtime preflight.
5. If needed, install a provider from the wizard.
6. If needed, complete or mock provider authentication from the wizard.
7. Choose a default provider and model.
8. Continue into the source-specific setup flow.
9. Verify the chosen source, provider, and model carry forward.

The final report must state which source path was clicked, which runtime install and
auth path was clicked, and which states were inspected.
