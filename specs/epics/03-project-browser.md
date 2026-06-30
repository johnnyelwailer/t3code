# Epic 03: Project Browser

## Purpose

The project browser replaces "choose a folder and start chatting" with "choose or create
a project." It should be the first anti-blank-surface experience.

The implementation must start from the existing T3 Code shell and UI elements as the
baseline. The first `t3work` UI should copy or import the current shell structure,
navigation, primitives, visual density, and interaction patterns, then adapt that
baseline for project, integration, recipe, and artifact workflows.

This is not a greenfield UI. Divergence from the existing T3 shell should be deliberate
and tied to a `t3work` use case.

## Main Views

### Project List

Shows all known `t3work` projects.

Card content:

- project name
- project kind
- source badges, such as Jira or local
- managed workspace indicator
- recent issue count
- recent artifact count
- latest run state
- top suggested recipe

### Create Project

Options:

- create from Atlassian
- create empty managed project
- import existing local T3 project
- attach local folder to project

The default path for non-technical users should be "create from Atlassian."

### Project Overview

Shows:

- project context summary
- connected sources
- current Jira issues or other resources
- suggested recipes
- project-scoped action recipes rendered from current project context
- recent artifacts
- recent agent runs
- project memory shortcuts

Recipe groups:

- Understand
- Plan
- Test
- Report
- Coordinate
- Automate

### Resource Detail

For a Jira issue:

- title, key, type, status, priority
- assignee and reporter
- labels
- description
- comments
- linked issues
- cached/generated artifacts
- context-relevant recipes
- action recipes in the right side panel, with labels and visibility rendered from the
  selected resource context
- mutation drafts

## UX Requirements

- Copy or import existing T3 shell UI elements before creating replacements.
- Keep existing T3 interaction patterns unless the `t3work` workflow requires a
  different one.
- The workspace path should be hidden by default.
- Advanced users should be able to reveal and open the managed workspace.
- Recipes should be visible before the chat box.
- The chat box should remain available for follow-up.
- Recent generated artifacts should be easier to find than old chat turns.

## First Jira Project Flow

1. Click "New project."
2. Choose "Atlassian."
3. Complete agent runtime preflight by choosing or installing a default provider and model.
4. Connect Atlassian and pick a site if needed.
5. Pick a Jira project from accessible projects.
6. Shell creates managed workspace.
7. Shell stores project source metadata and runtime defaults.
8. Shell opens project overview with issues and recipes.

## Empty State

The empty state should present concrete actions:

- Connect Atlassian
- Import existing T3 project
- Create managed project

It should not rely on explanatory paragraphs as the primary UI.
