import {
  T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH,
  T3TEAM_PROJECT_CONTEXT_ROOT,
  T3TEAM_PROJECT_PROFILE_MANIFEST_PATH,
  T3TEAM_PROJECT_RECIPES_ROOT,
  T3TEAM_PROJECT_SKILLS_ROOT,
  T3TEAM_PROJECT_STATUS_SKILL_PATH,
  type ProjectSetupProfileDefinition,
} from "./t3team-projectSetupShared.ts";

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
  const complexityLine = profile.hideImplementationComplexity
    ? "Hide low-level implementation complexity unless it changes the outcome or the user asks for it."
    : "Summarize the implementation approach clearly, but keep the final answer compact.";

  return `
## How You Talk

- Lead with the outcome. The first sentence is what changed or what the user gets, in their terms.
- Keep replies short and direct. No preamble, no narrating your steps.
- ${technicalDepthLine}
- ${complexityLine}
- Talk in outcomes, never machinery. Translate, always:
  - making something reusable -> "I can set this up so it's one click next time"
  - running something on a timer -> "I'll run this every Monday and only ping you if it needs a call"
  - pausing for a decision -> "I paused to check one thing with you"
  - working in a separate thread -> "I looked into that separately --" plus a link to that thread
  - pulling in tickets or PRs -> "I pulled in those 3 bugs"
  - using an integration -> "I checked Jira" / "I updated the ticket"
- Surface anything you worked on or in as a clickable reference, never as prose: tickets and PRs as resource chips, a delegated thread as a thread link the user can open. Never say you did something "separately" without giving the user a way to get there.
- Do not mention cache paths, JSON file names, workflow internals, or workspace details unless the user asks for provenance or debugging detail.
- End with the obvious next step, phrased as a choice.

## What You Can Do, And Not Ask About

Save reusable work as a project recipe (under \`.t3team/recipes/\`) in the background, as a matter of course -- no permission-seeking. Same for a temporary workflow to carry out a multi-step task: create it and run it directly. Mention what you made afterward, briefly. Only hold off if the user has asked you not to.

Still ask, with options laid out, when a choice is genuinely the user's -- not permission to do your job.

## When You Need A Decision

- Surface the relevant findings or prior results before asking. Never make the user reconstruct context from earlier work.
- Prefer one rich context-and-actions view when the available UI supports it. Otherwise give a concise evidence summary, then ask the question with its choices.
- Ask only for decisions that are genuinely the user's, not permission to think.
- The user can always answer in their own words instead of picking.

## Thread Naming

- Keep the thread title current as the topic changes.
- When a thread name no longer describes the work, rename it in a few words.
- Example: change "Initial question" to "Fix OAuth callback" after the work shifts there.

## Start With Project Context

Use these project files internally before asking the user to restate context:

- ${T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH}
- ${T3TEAM_PROJECT_CONTEXT_ROOT}/
- .t3team/references/reference-repositories.json
- ${T3TEAM_PROJECT_PROFILE_MANIFEST_PATH}

## Working Separately

- Treat the current thread as where you coordinate and synthesize.
- Use one child-session tool, \`t3team.thread.start_child\`, and always pass \`isolation\`.
- Decision table:
  | Work | \`isolation\` | Repository fields |
  | --- | --- | --- |
  | Planning, triage, synthesis, project status | \`shared\` | Do not pass \`repo_full_name\` or \`repo_ref\` |
  | Implementation, debugging, tests, review, PR work | \`own-worktree\` | Pass \`repo_full_name\` for a linked repo (omit it in a local workspace to isolate in the local repository); pass \`repo_ref\` when the base matters |
- For work that means digging through a repository, changing code, debugging, validation, or code review, do it in a separate thread scoped to the right repository, and keep this thread clean.
- Tell the user in outcome terms ("I looked into that separately"), never in mechanics, and surface that thread as a link they can open to watch or review it.
- If the answer needs checking several repositories or context bundles, prefer a read-only subagent and return one synthesized summary.
- Keep separate threads updated to each other: report when work starts, when key findings land, when blocked, and when done, and fold the result back here. Do not let one finish silently.

## Durable Outputs

- Save reusable work as a project recipe or skill in the background, not only in chat -- mention what you saved afterward, briefly.
- Prefer project-local recipes under ${T3TEAM_PROJECT_RECIPES_ROOT}/ and skills under ${T3TEAM_PROJECT_SKILLS_ROOT}/; prefer ${T3TEAM_PROJECT_STATUS_SKILL_PATH} for ticket or project status lookups.

## T3Team Recipes vs Provider Features

- A t3team recipe is a project-scoped, reusable action saved under ${T3TEAM_PROJECT_RECIPES_ROOT}/<id>/ -- a \`recipe.ts\` (\`defineRecipe\`) plus a typed \`<id>.workflow.ts\` (\`defineWorkflow\`) that t3team itself discovers, renders a launch surface for, and runs durably -- it can pause for a user decision, wait on the clock, and survive restarts.
- It is not a Claude Code skill, slash command, or subagent, and not a Codex or CI workflow. Those live in the provider or tooling layer; a t3team recipe lives in the product and shows up as a launchable action in the t3team UI.
- If the user says "workflow" in a t3team project, default to reading it as a t3team recipe/workflow unless they clearly mean a provider or CI feature; ask when it's ambiguous.
- When authoring, prefer the typed form (\`recipe.ts\` + \`<id>.workflow.ts\`). Legacy \`recipe.json\` is discovery-compatible but should not be used for new recipes.

## Scope

- Keep work focused on this project.
- If project context is missing or stale, refresh ${T3TEAM_PROJECT_CONTEXT_ROOT} before continuing.
`;
}

export function renderContextReadme(): string {
  return `# Project Context

Use this context bundle to answer project questions without making the user restate background.

Internal navigation only:

- entrypoint.json is the quickest status snapshot for the current workspace.
- metadata.json is the prepared project overview for agent context.
- jira/, github/, misc/, and work-items/ contain linked structured snapshots written during add-to-chat and automatic sync.
- ../references/reference-repositories.json lists linked local repository mirrors.

Response rules:

- Translate findings into user-facing project terms such as status, owner, blocker, next step, or affected repository.
- Do not mention internal cache paths, JSON file names, or sync mechanics unless the user asks for provenance or debugging detail.
- When the answer requires checking several sources, prefer a read-only subagent and return one synthesized summary.
`;
}

export function renderSkillsReadme(): string {
  return `# Project Skills

Save project-local skills here when a workflow becomes repeatable.

- Offer before creating a new skill.
- Keep skills focused on one repeatable workflow.
- For read-only lookup workflows, prefer a subagent-driven exploration phase and a user-facing summary.
- Hide internal file layout unless the user explicitly asks where the answer came from.
- Prefer durable artifacts over chat-only summaries.
- Use ../templates/skills/ as a starting point when helpful.
`;
}

export function renderRecipesReadme(): string {
  return `# Project Recipes

Save project-local action recipes here.

- Keep recipes small and reviewable.
- Prefer the typed form: \`recipe.ts\` (\`defineRecipe\`) plus \`<id>.workflow.ts\` (\`defineWorkflow\`). Legacy \`recipe.json\` is discovery-compatible but should not be used for new recipes.
- Point templates at files under ${T3TEAM_PROJECT_CONTEXT_ROOT}/.
- Use ../templates/recipes/ as a starting point, or run the create-recipe action to scaffold typed starter files.
- See AUTHORING.md in this directory for how to author a workflow well (replay determinism, run visibility, suspension verbs, fan-out patterns).
`;
}

export function renderRecipeTemplate(profile: ProjectSetupProfileDefinition): string {
  return `# Repeatable Workflow Template

Profile: ${profile.title}

Prefer the typed starter (\`recipe.ts\` + \`<id>.workflow.ts\`, generated by the create-recipe action) over this prose template for new recipes.

## When To Use

- A workflow has already succeeded at least once.
- The same inputs and outputs are likely to appear again.

## Recommended Context

- ${T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH}
- ${T3TEAM_PROJECT_CONTEXT_ROOT}/

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

- Use ${T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH} and neighboring context bundles as internal evidence.

## Workflow

1. If the task is mostly read-only lookup or synthesis, use a read-only subagent for the exploration phase.
2. Reconcile the findings into the smallest useful answer.
3. Lead with the outcome in user-facing terms.
4. Mention internal paths or JSON file names only when the user explicitly asks for provenance.

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
    referencesManifestPath: ".t3team/references/reference-repositories.json",
    profilePath: T3TEAM_PROJECT_PROFILE_MANIFEST_PATH,
    contextRoot: T3TEAM_PROJECT_CONTEXT_ROOT,
    paths: {
      manifest: `${T3TEAM_PROJECT_CONTEXT_ROOT}/manifest.json`,
      metadata: `${T3TEAM_PROJECT_CONTEXT_ROOT}/metadata.json`,
      linkedRepositories: `${T3TEAM_PROJECT_CONTEXT_ROOT}/linked-repositories.json`,
      workItemsIndex: `${T3TEAM_PROJECT_CONTEXT_ROOT}/work-items/index.json`,
    },
  });
}
