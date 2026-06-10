import {
  T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH,
  T3WORK_PROJECT_CONTEXT_ROOT,
  T3WORK_PROJECT_PROFILE_MANIFEST_PATH,
  T3WORK_PROJECT_RECIPES_ROOT,
  T3WORK_PROJECT_SKILLS_ROOT,
  T3WORK_PROJECT_STATUS_SKILL_PATH,
  type ProjectSetupProfileDefinition,
} from "./t3work-projectSetupShared.ts";

function resolveConversationStyleLines(profile: ProjectSetupProfileDefinition) {
  const technicalDepthLine =
    profile.communicationStyle.technicalDepth === "high"
      ? "Give implementation detail and verification notes when they materially change a decision."
      : profile.communicationStyle.technicalDepth === "medium"
        ? "Use only enough technical detail to explain tradeoffs, risks, or validation results."
        : "Use plain, non-technical language unless the user explicitly asks for implementation detail.";
  const complexityLine = profile.hideImplementationComplexity
    ? "Hide low-level implementation complexity unless it changes the outcome or the user asks for it."
    : "Summarize the implementation approach clearly, but keep the final answer compact.";

  return { technicalDepthLine, complexityLine };
}

export function renderLegacyAgentsMd(profile: ProjectSetupProfileDefinition): string {
  const { technicalDepthLine, complexityLine } = resolveConversationStyleLines(profile);

  return `# t3work Project Agent Guide

## Conversation Style

- Keep replies short and direct.
- ${technicalDepthLine}
- ${complexityLine}
- Explain what changed, why it matters, and what the user should do next.

## Thread Naming

- Keep the thread title current as the topic changes.
- When a thread name no longer describes the work, rename it in a few words.
- Example: change "Initial question" to "Fix OAuth callback" after the work shifts there.

## Start With Project Context

Use these project files before asking the user to restate context:

- ${T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH}
- ${T3WORK_PROJECT_CONTEXT_ROOT}/
- .t3work/references/reference-repositories.json
- ${T3WORK_PROJECT_PROFILE_MANIFEST_PATH}

## Durable Outputs

- Save durable project artifacts in the workspace, not only in chat.
- Prefer project-local recipes under ${T3WORK_PROJECT_RECIPES_ROOT}/.
- Prefer project-local skills under ${T3WORK_PROJECT_SKILLS_ROOT}/ for repeatable workflows.
- After a workflow succeeds and looks reusable, proactively offer to create or update a project skill or recipe.
- Offer first. Do not silently create project skills or recipes.

## Scope

- Keep work focused on this project.
- If project context is missing or stale, refresh ${T3WORK_PROJECT_CONTEXT_ROOT} before continuing.
`;
}

export function renderPreviousAgentsMd(profile: ProjectSetupProfileDefinition): string {
  const { technicalDepthLine, complexityLine } = resolveConversationStyleLines(profile);

  // Reproduces the AGENTS.md version replaced by Epic 28 (the prior "Conversation Style" +
  // "Child Sessions"/start_child form), so existing projects still on it are recognized as
  // managed and auto-refreshed to the current content. Historical bytes — do not edit.
  return `
## Conversation Style

- Keep replies short and direct.
- ${technicalDepthLine}
- ${complexityLine}
- Use project context files as internal evidence, but answer in user-facing project terms.
- Do not mention cache paths, JSON file names, or workspace internals unless the user asks for provenance or debugging detail.
- Explain what changed, why it matters, and what the user should do next.

## Thread Naming

- Keep the thread title current as the topic changes.
- When a thread name no longer describes the work, rename it in a few words.
- Example: change "Initial question" to "Fix OAuth callback" after the work shifts there.

## Start With Project Context

Use these project files internally before asking the user to restate context:

- ${T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH}
- ${T3WORK_PROJECT_CONTEXT_ROOT}/
- .t3work/references/reference-repositories.json
- ${T3WORK_PROJECT_PROFILE_MANIFEST_PATH}

## Child Sessions

- Treat the current thread as the coordination and synthesis thread.
- Default to a child session for work that requires digging through a repository, checking a specific repository or worktree, making code changes, debugging, validation, or code review.
- For repository-scoped child sessions, prefer a single task-shaped start_child call that passes repo_full_name and repo_ref so the runtime prepares the scoped directory and base ref up front.
- When repository-specific work is involved, start the child in the correct linked repository/worktree and keep the child focused on one concrete slice.
- Do not ask a child session to manually clone, checkout, or cd when the start_child call can scope the repo directory for it.
- If the work splits by repository, worktree, branch, or concern, start separate child sessions instead of one broad exploratory thread.
- Keep work in the parent thread only when the answer is direct, planning-only, or small enough that it does not require repository digging or code execution.

## Parent And Child Coordination

- Parent and child threads must keep each other updated.
- Child sessions should report when work starts, when important findings land, when blockers appear, and when work is finished.
- Parent threads should acknowledge those updates, decide next steps, and fold the child outcome back into the user-facing thread.
- Use explicit cross-thread messaging when the runtime supports it; otherwise use the available durable handoff or completion updates and do not let a child finish silently.

## Status And Context Questions

- Lead with the direct answer first.
- Then add owner, blocker, due signal, next step, or affected repository when available.
- Keep the exploration steps internal unless the user asks how the answer was verified.
- If the answer requires checking multiple context bundles or repositories, prefer a read-only subagent and return one synthesized summary.

## Durable Outputs

- Save durable project artifacts in the workspace, not only in chat.
- Prefer project-local recipes under ${T3WORK_PROJECT_RECIPES_ROOT}/.
- Prefer project-local skills under ${T3WORK_PROJECT_SKILLS_ROOT}/ for repeatable workflows.
- For ticket or project status lookups, prefer ${T3WORK_PROJECT_STATUS_SKILL_PATH} when it is available.
- After a workflow succeeds and looks reusable, proactively offer to create or update a project skill or recipe.
- Offer first. Do not silently create project skills or recipes.

## Scope

- Keep work focused on this project.
- If project context is missing or stale, refresh ${T3WORK_PROJECT_CONTEXT_ROOT} before continuing.
`;
}
