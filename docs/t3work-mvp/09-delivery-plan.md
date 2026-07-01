# Epic 09: Delivery Plan

This plan describes the first proof slice. Under the pack-driven vision, Atlassian/Jira
deliverables should be treated as proof-pack or connector-distribution work, not as
permanent core product shape.

## Phase 0: Architecture Spike

Deliverables:

- `packages/t3work-context`
- `packages/t3work-integrations-core`
- `packages/t3work-recipes`
- `packages/t3work-t3-adapter`
- skeleton `apps/web/src/t3work`
- mock integration provider
- one managed workspace from mock project

Validation:

- `t3work` creates a project without selecting a directory
- `t3work` can start a T3 thread through adapter
- recipe can attach mock resource context

## Phase 1: Project Browser

Deliverables:

- project registry
- managed workspace creation
- project list
- project detail page
- import existing local T3 project
- create managed project from mock source

Validation:

- users can browse projects without seeing file paths by default
- advanced users can inspect workspace path
- existing shell behavior is unchanged

## Phase 2: Atlassian Read Integration

Deliverables:

- Atlassian connector implementation
- account/site discovery
- Jira project listing
- Jira issue listing
- Jira issue detail snapshots
- local cache under managed workspace

Validation:

- user can choose a Jira project visible to their account
- shell creates a local project from that Jira project
- shell shows issues from the selected Jira project

## Phase 3: Recipe Launcher

Deliverables:

- recipe registry
- applicability matcher
- project-local and pack-provided recipe plugin-module (`recipe.ts`) registry
- pre-launch recipe metadata rendering for dashboard and side panel actions
- recipe run materialization into `runs/<run-id>/recipe/`
- `context.json`, `context.schema.json`, and `context-map.md` generation
- recipe cards on project and issue pages
- recipe launch into T3 thread
- special recipe launch timeline message
- structured context attachment
- simple-language profile

Validation:

- issue page shows context-relevant recipes
- rendered action labels use selected issue data before launch
- launched recipe materializes a run directory (`runs/<run-id>/recipe/`)
- recipe output references the selected issue
- chat is no longer the first blank surface

## Phase 4: Rich Artifacts

Deliverables:

- artifact schema
- artifact persistence
- artifact viewer
- initial block renderers
- plan/test matrix/risk board artifacts
- MDX/HTML fallback export

Validation:

- recipes save durable outputs
- outputs can be reopened outside the original thread
- chat response points to a rich artifact

## Phase 5: Reviewable Mutations

Deliverables:

- mutation proposal schema
- Jira comment prepare/commit
- mutation preview UI
- artifact-to-comment flow
- mutation audit record

Validation:

- skill can draft a Jira comment
- user can review/edit before posting
- committed mutation is recorded locally

## Technical Risks

- Deep imports from T3 internals can break as upstream changes.
- Existing orchestration project contracts still require `workspaceRoot`.
- Skill output can become inconsistent if rich artifact schemas are too loose.
- Atlassian custom fields vary heavily across projects.
- External mutation UX can become unsafe if commit tools are exposed too early.
- Managed workspace lifecycle needs cleanup/export behavior.

## Mitigations

- Keep all T3 coupling inside `packages/t3work-t3-adapter`.
- Treat `workspaceRoot` as internal in `t3work` UI.
- Start with a small artifact block schema.
- Store raw Jira snapshots alongside normalized snapshots.
- Make Jira mutations prepare-only until review UI exists.
- Expose "Open managed workspace" and "Clear cached integration data."
