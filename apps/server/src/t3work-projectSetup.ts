import {
  jsonFile,
  renderAgentsMd,
  renderContextEntrypointPlaceholder,
  renderContextReadme,
  renderRecipeTemplate,
  renderRecipesReadme,
  renderSkillTemplate,
  renderSkillsReadme,
} from "./t3work-projectSetupContent.ts";
import {
  DEFAULT_T3WORK_PROJECT_SETUP_PROFILE_ID,
  resolveT3WorkProjectSetupProfileId,
  T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH,
  T3WORK_PROJECT_CONTEXT_ROOT,
  T3WORK_PROJECT_PROFILE_MANIFEST_PATH,
  T3WORK_PROJECT_RECIPES_ROOT,
  T3WORK_PROJECT_SETUP_PROFILES,
  T3WORK_PROJECT_SETUP_VERSION,
  T3WORK_PROJECT_SKILLS_ROOT,
  T3WORK_PROJECT_TEMPLATES_ROOT,
  type T3WorkProjectSetupFile,
} from "./t3work-projectSetupShared.ts";

export {
  DEFAULT_T3WORK_PROJECT_SETUP_PROFILE_ID,
  resolveT3WorkProjectSetupProfileId,
  T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH,
  T3WORK_PROJECT_PROFILE_MANIFEST_PATH,
} from "./t3work-projectSetupShared.ts";

export function renderT3WorkProjectSetupFiles(input?: {
  readonly profileId?: string;
}): ReadonlyArray<T3WorkProjectSetupFile> {
  const profile =
    T3WORK_PROJECT_SETUP_PROFILES[resolveT3WorkProjectSetupProfileId(input?.profileId)];
  return [
    {
      relativePath: "AGENTS.md",
      contents: renderAgentsMd(profile),
      writeMode: "if-missing",
    },
    {
      relativePath: T3WORK_PROJECT_PROFILE_MANIFEST_PATH,
      contents: jsonFile({
        version: T3WORK_PROJECT_SETUP_VERSION,
        profileId: profile.id,
        title: profile.title,
        description: profile.description,
        audience: profile.audience,
        communicationStyle: profile.communicationStyle,
        recommendedSkillPackIds: profile.recommendedSkillPackIds,
      }),
      writeMode: "overwrite",
    },
    {
      relativePath: `${T3WORK_PROJECT_CONTEXT_ROOT}/README.md`,
      contents: renderContextReadme(),
      writeMode: "if-missing",
    },
    {
      relativePath: T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH,
      contents: renderContextEntrypointPlaceholder(),
      writeMode: "if-missing",
    },
    {
      relativePath: `${T3WORK_PROJECT_RECIPES_ROOT}/README.md`,
      contents: renderRecipesReadme(),
      writeMode: "if-missing",
    },
    {
      relativePath: `${T3WORK_PROJECT_SKILLS_ROOT}/README.md`,
      contents: renderSkillsReadme(),
      writeMode: "if-missing",
    },
    {
      relativePath: `${T3WORK_PROJECT_TEMPLATES_ROOT}/recipes/repeatable-workflow.md`,
      contents: renderRecipeTemplate(profile),
      writeMode: "if-missing",
    },
    {
      relativePath: `${T3WORK_PROJECT_TEMPLATES_ROOT}/skills/repeatable-workflow/SKILL.md`,
      contents: renderSkillTemplate(profile),
      writeMode: "if-missing",
    },
  ];
}
