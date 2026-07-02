# Epic 11: Atlassian Setup UI

## Purpose

Design the Atlassian connection, Jira project selection, and project confirmation
experience using the existing T3 Code shell and UI primitives as the baseline.

This document starts after the generic source choice and agent runtime preflight defined
in [Epic 23: Project Setup Preflight UI](./23-project-setup-preflight-ui.md).

Under the pack-driven vision, this flow is the setup UI for an Atlassian connector/proof
pack. It should not assume Atlassian is a core source or that other packs must reuse
Atlassian-specific screens.

This flow should make Atlassian-backed project creation feel structured and low-effort:

1. Connect Atlassian.
2. Choose an Atlassian site/account.
3. Choose a Jira project.
4. Confirm managed workspace settings.
5. Land in the project overview with relevant recipes.

## Existing T3 Baseline

The implementation must start from these existing T3 surfaces and primitives:

- `AppSidebarLayout` for the overall shell frame.
- `Sidebar` and `ui/sidebar` primitives for left navigation.
- `SettingsPageContainer`, `SettingsSection`, and `SettingsRow` for structured setup
  pages.
- `Dialog`, `AlertDialog`, `Popover`, `Menu`, and `Select` for focused choices.
- `Button`, `Badge`, `Input`, `Textarea`, `Switch`, `Spinner`, `Skeleton`, `Tooltip`,
  `Toast`, and `ScrollArea` for controls and states.
- `ProjectFavicon` as the local pattern for project identity fallback.
- Existing provider/settings cards as the baseline for integration account cards.

This is not a new design system. Copy or import the existing primitives first, then add
only the missing `t3work`-specific composition.

## Brand Assets

Use official Atlassian assets, not third-party logo copies.

Sources:

- Atlassian Design logos page: `https://atlassian.design/foundations/logos`
- Atlassian trademark page: `https://www.atlassian.com/legal/trademark`
- Optional package candidate: `@atlassian/brand-logos`

Asset rules:

- Source logos from Atlassian's official design site or official package.
- Use product logos only to identify the integration or product.
- Do not modify Atlassian or Jira logos except resizing.
- Do not combine Atlassian logos with the T3 Code logo.
- Do not mimic Atlassian's website look and feel.
- Use `Atlassian` as alt text for the Atlassian company logo.
- Use `Jira` as alt text for the Jira logo.

Recommended MVP assets:

- Atlassian logomark or logo for provider selection.
- Jira logo for Jira project selection and source badges.
- Confluence logo only when Confluence support is actually present.

## Information Architecture

### Entry Points

Project shell should expose Atlassian setup from:

- project browser empty state
- project browser "New project" button
- integrations/settings page
- project source add button

The primary entry point for the MVP is the project browser.

### Flow Shape

Prefer an inline setup page for first-time setup and a dialog for smaller follow-up
actions.

The generic source choice and agent runtime preflight are specified in
[Epic 23: Project Setup Preflight UI](./23-project-setup-preflight-ui.md). This
document starts once the user has chosen Atlassian and satisfied preflight.

First-time flow:

```text
Project Browser
  -> New Project
  -> Choose Atlassian
  -> Agent Runtime Preflight
  -> Connect Atlassian
  -> Select Site
  -> Select Jira Project
  -> Confirm Project
  -> Project Overview
```

Returning-user flow:

```text
Project Browser
  -> New Project
  -> Choose Atlassian
  -> Agent Runtime Preflight
  -> Select Jira Project
  -> Confirm Project
  -> Project Overview
```

## Screen 1: Connect Atlassian

Baseline:

- Existing pairing/connection settings rows.
- Existing dialog/toast patterns for auth status.

Content:

- Atlassian logo
- concise explanation of what the app will read
- connect button
- account status after connection

Required copy:

- what will be read: visible sites, Jira projects, issues, comments
- what will not happen automatically: no Jira edits without approval
- where data is cached: local managed workspace

Controls:

- `Connect Atlassian`
- `Cancel`
- `Retry`
- `Disconnect` after connected

States:

- awaiting auth
- polling/connecting
- success
- denied/cancelled
- expired
- network error

## Screen 2: Select Atlassian Site

Show this only when the account has multiple accessible sites.

Baseline:

- `Select` or list row pattern from settings.
- `ScrollArea` for long site lists.
- `Skeleton` while loading.

Site row:

- Atlassian logo or generic site icon
- site name
- site URL
- optional role/access hint if available
- selected state

Actions:

- `Back`
- `Continue`
- `Refresh`

Empty state:

- title: `No Atlassian sites found`
- actions: `Retry`, `Use another account`

## Screen 3: Select Jira Project

This is the core project selection UI.

Baseline:

- Existing sidebar project list density.
- Existing command palette/search interaction style.
- Existing badges and status indicators.

Layout:

- search input at top
- filter row for project type/category if available
- scrollable project list
- detail preview panel on the right for wider screens
- compact single-column version for narrow screens

Project row:

- Jira logo or project avatar
- project name
- project key
- project type, if available
- issue count or recent issue count, if available
- last updated hint, if available
- selected indicator

Preview panel:

- project name and key
- source: Jira
- site URL
- visible issue count if available
- default managed workspace path, collapsed by default
- top suggested recipes that will be enabled

Actions:

- `Back`
- `Refresh`
- `Continue`

States:

- loading projects
- loaded projects
- search with no matches
- no projects accessible
- API error
- permission error

## Screen 4: Confirm Project

Baseline:

- Existing settings section/row layout.
- Existing project/provider card style.

Content:

- project name
- Jira project key
- Atlassian site
- default agent provider
- default model
- managed workspace summary
- default profile
- initial recipe bundle
- cache policy summary

Defaults:

- workspace: managed
- agent provider: most recently used compatible provider instance or a recommended ready
  provider
- model: sticky last-used model for that provider instance or the provider's recommended
  default model
- profile: most recently used profile or a recommended starter profile based on project
  signals and the user's preferred guidance/detail settings
- recipes: explain ticket, review acceptance criteria, create QA test plan, draft Jira
  comment, summarize project risk
- mutation policy: review required

Controls:

- project name input
- provider summary row with change action
- model select or summary row with change action
- profile select
- clone/edit/create profile action
- advanced disclosure for workspace path
- create button
- back button

Important: do not ask the user to choose a local directory by default.

The confirm step may adjust the preflight selection after Jira project metadata loads,
but it must preserve the user's explicit choice unless the user changes it.

## Screen 5: Created Project Overview

After creation, land directly in the project overview.

Show:

- project title and source badge
- active agent provider and model summary
- Jira issues list
- suggested recipes
- recent artifacts area
- empty artifact state
- thread/run area

Primary first action:

- select a Jira issue
- or launch `Summarize project risk` if no issue is selected

## Component Inventory

New composition components likely needed:

- `AtlassianConnectionPanel`
- `AtlassianSiteList`
- `JiraProjectSearch`
- `JiraProjectList`
- `JiraProjectRow`
- `JiraProjectPreview`
- `ManagedWorkspaceSummary`
- `ProjectRecipeBundlePreview`
- `ProjectCreateConfirmation`

These should be built from existing T3 primitives. They are compositions, not new base
controls.

## Data Requirements

### Atlassian Site

```ts
type AtlassianSiteOption = {
  cloudId: string;
  name: string;
  url: string;
  avatarUrl?: string;
};
```

### Jira Project

```ts
type JiraProjectOption = {
  id: string;
  key: string;
  name: string;
  projectTypeKey?: string;
  avatarUrl?: string;
  url?: string;
  recentIssueCount?: number;
  lastIssueUpdatedAt?: string;
  raw?: unknown;
};
```

### Project Creation Draft

```ts
type AtlassianProjectCreationDraft = {
  provider: "atlassian";
  agentProviderInstanceId: string;
  defaultModelId?: string;
  cloudId: string;
  siteUrl: string;
  jiraProjectId: string;
  jiraProjectKey: string;
  title: string;
  workspaceKind: "managed";
  primaryProfileId: string;
  profileIds: string[];
  recipeIds: string[];
};
```

`primaryProfileId` and `profileIds` reference configured profile records. The setup flow
may offer bundled starter profiles, but the draft model must not assume a closed list of
built-in ids. If older persisted state only has `profileId`, import it as
`primaryProfileId: profileId` and `profileIds: [profileId]`.

When multiple profiles are selected, the setup flow should show a lightweight review step
before confirmation: selected profiles can be removed, and one selected profile must be
chosen as the primary profile. The primary profile controls communication style; all
selected profiles contribute role coverage and recipe/skill-pack defaults.

`agentProviderInstanceId` references a configured provider instance record. The setup
flow may recommend a provider or model, but the draft model must not assume a closed
list of built-in provider drivers or model ids.

## Accessibility Requirements

- All logos need alt text.
- Project rows must be keyboard navigable.
- Search should focus automatically when project selection opens.
- Selection must be conveyed without relying on color alone.
- Loading and error states must be screen-reader visible.
- Buttons must use concrete verbs: `Connect`, `Continue`, `Create project`, `Retry`.

## Storybook Requirements

Stories required before stabilization:

- Atlassian connect, loading
- Atlassian connect, error
- site picker, one site
- site picker, many sites
- Jira project picker, loading
- Jira project picker, empty
- Jira project picker, many projects
- Jira project picker, long names
- confirm project, default settings
- confirm project, advanced workspace expanded
- created project overview, no issues
- created project overview, with issues

## Browser Validation Script

For every implementation change in this flow, the agent must first validate the generic
source choice and runtime preflight in
[Epic 23: Project Setup Preflight UI](./23-project-setup-preflight-ui.md), then open
the app in a browser and click through:

1. Open project browser.
2. Click `New project`.
3. Choose Atlassian.
4. Pass agent runtime preflight.
5. Complete or mock Atlassian connection.
6. Select a site if multiple sites exist.
7. Search Jira projects.
8. Select a Jira project.
9. Confirm managed workspace settings.
10. Create project.
11. Verify project overview opens.
12. Verify Jira source badge/logo renders.
13. Verify relevant recipes render.
14. Verify the chosen provider and model summary render somewhere in the project shell.

The final report must state which runtime preflight path was clicked, which Atlassian
path was clicked, and which states were inspected.
