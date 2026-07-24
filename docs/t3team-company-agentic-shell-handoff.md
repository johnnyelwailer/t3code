# Company Agentic Shell Handoff

## Context

This document captures a high-level conversation about evolving T3 Code into a company-specific agentic workbench. The goal is to preserve the benefits of T3 Code as an upstream platform while exploring a product direction tailored to internal company workflows, projects, and knowledge systems.

The central idea is to move beyond a coding-chat interface toward a workbench where agents operate on first-class company work objects: Jira tickets, Confluence pages, GitHub Enterprise pull requests, project tasks, and shared workflow templates.

## Conversation Chronology

The conversation began with the practical question of whether T3 Code could be forked into a new internal agentic tool. The first product sketch centered on native Jira, Confluence, and GitHub Enterprise integrations, dedicated UIs for tasks and pull requests, direct ticket attachment as context, project-specific skills, and workflows that could be started from either slash commands or UI actions.

That led to a broader product framing: the company version should not just be a modified coding chat. It should be a ticket-centric and workflow-centric shell where chat is one interaction mode inside a larger operational interface.

The discussion then shifted to maintainability. A direct fork could enable fast experimentation, but it would also make it harder to absorb upstream T3 improvements. The preferred direction became a separate company shell that consumes T3 through stable surfaces where possible, wraps any unavoidable private imports behind local adapters, and only changes upstream T3 when a general extension point is truly needed.

## Product Thesis

The company shell should be a unified workbench for agent-assisted software work. Instead of starting with an empty prompt, users should usually start from a concrete work object:

- a Jira ticket that needs implementation, clarification, testing, or triage
- a pull request that needs review, summary, or follow-up changes
- a Confluence page that defines product requirements, runbooks, or project context
- a project view that aggregates open work, active agent runs, relevant knowledge, and team-specific workflows

The user experience should make the agent feel embedded in the existing work system. A ticket view can expose an "Implement" action. A pull request view can expose a "Review" action. A Confluence page can expose actions to summarize, extract requirements, or turn content into project context. Slash commands remain useful, but they should complement contextual actions rather than being the only entry point.

## Core Capabilities

The main capability areas discussed were:

- Native Jira integration for issues, comments, status, linked work, and ticket context.
- Native Confluence integration for specs, runbooks, decision records, and shared project knowledge.
- Native GitHub Enterprise integration for pull requests, review comments, checks, and repository context.
- Dedicated task and pull request views instead of forcing all work through a generic chat timeline.
- Typed context attachment so users can attach a ticket, page, or pull request directly to an agent run.
- Shared company workflow templates with project-specific overrides.
- UI-triggered workflows such as "Implement", "Review", "Summarize", "Investigate", or "Write tests".
- A shell variant that reuses T3 building blocks but rearranges them around end-to-end work.

## Architecture Direction

The preferred architecture is to treat T3 Code as a platform or engine rather than as a codebase to freely modify.

The company-specific product should live outside the upstream T3 source tree where practical. It should consume stable T3 surfaces first: contracts, protocol, orchestration concepts, provider/session behavior, and reusable UI primitives. If private source imports are necessary, they should be centralized behind a company-owned compatibility layer so future upstream changes are isolated to a small boundary.

The key maintainability principle is containment. Company-specific Jira, Confluence, GitHub Enterprise, workflow, and shell logic should not be scattered through upstream T3 files. When T3 lacks the right extension point, prefer adding a small general seam that could plausibly be useful upstream.

## Conceptual Model

The company shell can be thought of as four layers:

1. Integration layer: talks to Jira, Confluence, GitHub Enterprise, and other company systems.
2. Resource model: normalizes external objects into stable internal references.
3. Workflow layer: maps resource types and user actions to agent workflows.
4. Shell layer: presents task-centric UIs and connects user actions to orchestration runs.

This keeps the agent workflow grounded in real company objects while avoiding a design where every integration becomes a custom prompt hack.

## Workflow Model

Workflows should be explicit, reusable units rather than ad hoc button handlers. A workflow should define what kind of work object it applies to, what context it needs, what prompt or skill it uses, what approvals might be required, and what outcome it is expected to produce.

Examples discussed:

- Implement a Jira ticket.
- Review a pull request.
- Summarize a ticket or page.
- Write a test plan.
- Investigate a failing build.
- Respond to review comments.
- Prepare release notes.

Company-level templates can provide defaults, while individual projects can override behavior to match their repositories, conventions, terminology, and delivery process.

## Shell Direction

The new shell should rearrange the experience around work objects and workflow status.

A possible high-level navigation model:

- Inbox
- Jira
- Pull Requests
- Projects
- Runs
- Knowledge
- Settings

A work item view should combine the object itself, linked context, workflow actions, active agent runs, approvals, and generated outputs. The goal is for a user to move from "what needs doing?" to "agent is working on it" without manually collecting context and writing a long prompt.

## T3 Reuse Strategy

The reuse strategy discussed was:

1. Prefer protocol and API integration over source-level coupling.
2. Prefer public package exports over private file imports.
3. Wrap unavoidable private imports behind company-owned adapters.
4. Add small upstreamable extension points when the abstraction is generally useful.
5. Avoid direct upstream modifications for company-only behavior.

Deep imports can be useful as a short-term bridge, but they should not become the product architecture. The company shell should make it clear which parts are stable platform integration and which parts are compatibility shims.

## Open Questions

- Should the company shell be a separate repository, a sibling app, or a product layered around a vendored T3 checkout?
- Should the company shell own its own server layer, or delegate more directly to the existing T3 server and orchestration runtime?
- What authentication model is needed for Jira, Confluence, and GitHub Enterprise?
- How much external context should be cached versus fetched on demand?
- Should workflow templates be represented as code, configuration, Markdown skills, or a hybrid?
- Which T3 seams are missing today and should be proposed upstream?
- What is the smallest proof of concept that validates the ticket-centric workflow model?

## Suggested Next Step

Build a small proof of concept outside the upstream T3 source tree. The prototype should show one real work object, one typed context attachment, and one workflow action that starts an agent run. The goal is not to build the whole shell immediately, but to test whether the company-specific workflow can be layered around T3 without turning the upstream codebase into a permanent fork.
