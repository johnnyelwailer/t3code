import {
  T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH,
  T3WORK_PROJECT_CONTEXT_ROOT,
  T3WORK_PROJECT_PROFILE_MANIFEST_PATH,
  T3WORK_PROJECT_RECIPES_ROOT,
  T3WORK_PROJECT_SKILLS_ROOT,
  type ProjectSetupProfileDefinition,
} from "./t3work-projectSetupShared.ts";

export function jsonFile(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function renderAgentsMd(profile: ProjectSetupProfileDefinition): string {
  const technicalDepthLine =
    profile.communicationStyle.technicalDepth === "high"
      ? "Give implementation detail and verification notes when they materially change a decision."
      : profile.communicationStyle.technicalDepth === "medium"
        ? "Use only enough technical detail to explain tradeoffs, risks, or validation results."
        : "Use plain, non-technical language unless the user explicitly asks for implementation detail.";
  const complexityLine = profile.communicationStyle.hideImplementationComplexity
    ? "Hide low-level implementation complexity unless it changes the outcome or the user asks for it."
    : "Summarize the implementation approach clearly, but keep the final answer compact.";

  return `# t3work Project Agent Guide

## Conversation Style

- Keep replies short and direct.
- ${technicalDepthLine}
- ${complexityLine}
- Explain what changed, why it matters, and what the user should do next.

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

export function renderContextReadme(): string {
  return `# Project Context

Start with entrypoint.json for the latest synced project summary.

- metadata.json holds the latest project overview prepared for agent context.
- jira/, github/, misc/, and work-items/ contain the linked structured snapshots written during add-to-chat and automatic sync.
- ../references/reference-repositories.json lists linked local repository mirrors.
`;
}

export function renderSkillsReadme(): string {
  return `# Project Skills

Save project-local skills here when a workflow becomes repeatable.

- Offer before creating a new skill.
- Keep skills focused on one repeatable workflow.
- Prefer durable artifacts over chat-only summaries.
- Use ../templates/skills/ as a starting point when helpful.
`;
}

export function renderRecipesReadme(): string {
  return `# Project Recipes

Save project-local action recipes here.

- Keep recipes small and reviewable.
- Point templates at files under ${T3WORK_PROJECT_CONTEXT_ROOT}/.
- Use ../templates/recipes/ as a starting point when a workflow should become a reusable action.
`;
}

export function renderRecipeTemplate(profile: ProjectSetupProfileDefinition): string {
  return `# Repeatable Workflow Template

Profile: ${profile.title}

## When To Use

- A workflow has already succeeded at least once.
- The same inputs and outputs are likely to appear again.

## Recommended Context

- ${T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH}
- ${T3WORK_PROJECT_CONTEXT_ROOT}/

## Expected Output

- A durable artifact saved in the project workspace.
- A short user-facing summary in plain language.
- A clear next step or approval question when needed.
`;
}

export function renderSkillTemplate(profile: ProjectSetupProfileDefinition): string {
  return `# SKILL Template

## Purpose

Help with a repeatable ${profile.title.toLowerCase()} workflow.

## Required Context

- ${T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH}

## Working Rules

- Keep the final explanation concise.
- Persist useful outputs in the workspace.
- Ask before creating or changing project-local recipes, skills, or external records.
`;
}

export function renderContextEntrypointPlaceholder(): string {
  return jsonFile({
    kind: "project-workspace-context",
    status: "pending-sync",
    referencesManifestPath: ".t3work/references/reference-repositories.json",
    profilePath: T3WORK_PROJECT_PROFILE_MANIFEST_PATH,
    contextRoot: T3WORK_PROJECT_CONTEXT_ROOT,
    paths: {
      manifest: `${T3WORK_PROJECT_CONTEXT_ROOT}/manifest.json`,
      metadata: `${T3WORK_PROJECT_CONTEXT_ROOT}/metadata.json`,
      linkedRepositories: `${T3WORK_PROJECT_CONTEXT_ROOT}/linked-repositories.json`,
      workItemsIndex: `${T3WORK_PROJECT_CONTEXT_ROOT}/work-items/index.json`,
    },
  });
}
