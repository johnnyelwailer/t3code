# Epic 06: Recipes And Skills

## Purpose

Recipes turn blank chat into contextual actions. A recipe is a visible UI launcher backed
by a workflow from a project-local source, user pack, distribution pack, or remote-managed
pack.

Action recipes are the stronger code-backed form: a trusted plugin-module directory
(`recipe.ts`) with metadata, a launcher View, templated files, a visibility predicate, and
a workflow. When launched, the shell materializes the recipe into a run directory and gives
the agent only the path to that run. See [Epic 16](./16-action-recipes.md) for the full
model.

## Recipe Model

A recipe is a **launchable workflow plus its presentation** — discovery metadata, an
optional launcher View, and the workflow that runs on click. It is authored as a
TypeScript plugin module (`recipe.ts`), not a JSON manifest with embedded expression
strings. The full model, the four core primitives (Context, Tools, Workflows, Views), and
the plugin-module contract are defined in [Epic 16: Action Recipes](./16-action-recipes.md).

The UI-facing projection that matching and the dashboard consume is small:

```ts
type RecipeMatchResult = {
  recipe: Recipe; // id, surfaces, displayName/shortDescription/icon/rank, applicability
  score: number;
  reason: string;
  missingContext: string[];
};
```

Pack-provided recipes and project-local recipes are the same concept with different
sources. The host discovers recipes from active pack manifests and local workspace
directories, then merges them through the pack precedence model. Metadata that varies by
context (display name, icon, rank, visibility) is plain code over the render context, not a
`{{ }}` template language.

## Recipe Scope

### Skill Pack Recipes

Provided by packs and enabled by selected skill packs or policy.

Examples:

- QA pack: test plan, acceptance criteria review, bug reproduction guide
- Product pack: requirement summary, stakeholder update, scope risk review
- Support pack: customer-facing explanation, escalation summary, reproduction request
- Delivery pack: release checklist, dependency review, standup summary

### Global Recipes

Installed globally, user-wide, or through a distribution pack and available across
workspaces when policy allows.

Examples:

- Explain this simply
- Draft a summary
- Find unclear requirements

### Project-Scoped Recipes

Stored in the managed project workspace.

Examples:

- Run our release checklist
- Use our QA signoff format
- Draft comment using our team tone

Project-scoped action recipes should be the first editable recipe scope. They live under
the managed project workspace in `recipes/<recipe-id>/` and are instantiated into
`runs/<run-id>/recipe/` when launched.

### Workspace-Scoped Recipes

Attached to a local repo/workspace.

Examples:

- Run smoke test plan
- Check implementation against local conventions
- Summarize recent code changes for QA

## Recipe Matching

Inputs:

- active project
- selected resource
- resource kind
- Jira issue type
- project profile
- enabled skill packs
- available pack-provided connectors
- project memory
- recent artifacts

Outputs:

- ranked recipes
- reason for applicability
- missing context warnings

Action recipe matching also renders pre-launch metadata such as display name, icon,
description, rank, and MDX action view from the current project or work item context.
This is needed because the dashboard and side panel show actions before a recipe is
instantiated.

## Initial Recipes

### Explain Ticket Simply

Output:

- short summary
- user impact
- what needs checking
- unclear points
- source links

### Review Acceptance Criteria

Output:

- acceptance criteria list
- ambiguity warnings
- missing testability notes
- questions for developer/product

### Create QA Test Plan

Output:

- test matrix
- environment assumptions
- edge cases
- regression/smoke split
- estimated effort

### Draft Jira Comment

Output:

- editable comment proposal
- mutation preview

### Summarize Project Risk

Output:

- risk board
- blocked tickets
- unclear tickets
- suggested next actions

## Skill Contract

A recipe launch should provide the skill with:

- project profile
- selected resource snapshots
- allowed tools
- output format preference
- persistence policy
- mutation policy

Skills should save durable artifacts by default and return a concise chat summary only
as a companion.

An action recipe launch should additionally materialize these files into the run directory
(`runs/<run-id>/recipe/`):

- `context.json`
- `context.schema.json`
- `context-map.md`
- the resolved `recipe.ts`
- rendered prompt and subfiles
- `workflow-state.json` (the persisted forward-only cursor)

The schema and context map are part of the authoring contract. Agents creating new
project recipes should inspect them before writing recipe modules. "Allowed tools" above
is the recipe's `allowedToolGroups` scoping the single shared tool surface
([Epic 21](./21-context-tool-catalog.md)), not a recipe-specific tool API.

## Product Positioning

Recipes should not assume the user is a QA engineer. QA is the first skill pack, not the
entire product.

The same project, resource, recipe, artifact, and mutation model should support:

- QA and test planning
- product clarification
- support triage
- delivery coordination
- engineering implementation
- release preparation
