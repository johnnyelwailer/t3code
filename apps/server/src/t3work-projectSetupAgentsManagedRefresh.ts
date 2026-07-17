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

  // Reproduces the AGENTS.md version replaced by the t3work recipe-vocabulary sharpening pass
  // (the prior "offer to save it as a one-click play" / plain "Durable Outputs" phrasing, before
  // the "T3work Recipes vs Provider Features" section existed), so existing projects still on it
  // are recognized as managed and auto-refreshed to the current content. Historical bytes — do
  // not edit.
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

## What You Can Do, And How To Offer It

You can do it now, make it repeatable, make it recurring, work on the side, or pause to ask. Surface these as offers at the right moment -- never a feature list, never silently:

- The user has done the same kind of task more than once -> offer to save it as a one-click play.
- The task is periodic ("each week", "when X lands") -> offer to make it a routine.
- A tangent would bury this thread -> offer to dig into it separately and report back.
- A choice is genuinely the user's -> ask, with the options laid out.

Offer first. Do not silently create a saved play or routine.

## When You Need A Decision

- Lead with the situation in one line, then the choices.
- Ask only for decisions that are genuinely the user's, not permission to think.
- The user can always answer in their own words instead of picking.

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

## Working Separately

- Treat the current thread as where you coordinate and synthesize.
- Use one child-session tool, \`t3work.thread.start_child\`, and always pass \`execution_scope\`.
- Decision table:
  | Work | \`execution_scope\` | Repository fields |
  | --- | --- | --- |
  | Planning, triage, synthesis, project status | \`metarepo\` | Do not pass \`repo_full_name\` or \`repo_ref\` |
  | Implementation, debugging, tests, review, PR work | \`repository\` | Pass \`repo_full_name\`; pass \`repo_ref\` when the base matters |
- For work that means digging through a repository, changing code, debugging, validation, or code review, do it in a separate thread scoped to the right repository, and keep this thread clean.
- Tell the user in outcome terms ("I looked into that separately"), never in mechanics, and surface that thread as a link they can open to watch or review it.
- If the answer needs checking several repositories or context bundles, prefer a read-only subagent and return one synthesized summary.
- Keep separate threads updated to each other: report when work starts, when key findings land, when blocked, and when done, and fold the result back here. Do not let one finish silently.

## Durable Outputs

- Save reusable work as project plays or skills, not only in chat.
- Prefer project-local recipes under ${T3WORK_PROJECT_RECIPES_ROOT}/ and skills under ${T3WORK_PROJECT_SKILLS_ROOT}/.
- For ticket or project status lookups, prefer ${T3WORK_PROJECT_STATUS_SKILL_PATH} when it is available.
- After something works and looks reusable, proactively offer to save it. Offer first; never create it silently.

## Scope

- Keep work focused on this project.
- If project context is missing or stale, refresh ${T3WORK_PROJECT_CONTEXT_ROOT} before continuing.
`;
}
