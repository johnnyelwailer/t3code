import {
  buildProjectLocalProfilePath,
  isBundledT3WorkProfileId,
} from "@t3tools/t3work-skill-packs";

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
import { renderChangeRequestAssessmentSkill } from "./t3work-projectSetupChangeRequestSkill.ts";
import { renderChangeRequestAssessmentTemplate } from "./t3work-projectSetupChangeRequestTemplate.ts";
import { renderBundledRecipeSetupFiles } from "./t3work-projectSetupRecipes.ts";
import { renderStatusAndContextSkill } from "./t3work-projectSetupStatusSkill.ts";
import {
  T3WORK_PROJECT_CLAUDE_PATH,
  resolveT3WorkProjectSetupProfile,
  T3WORK_PROJECT_AGENTS_PATH,
  T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH,
  T3WORK_PROJECT_CONTEXT_ROOT,
  T3WORK_PROJECT_PROFILE_MANIFEST_PATH,
  T3WORK_PROJECT_RECIPES_ROOT,
  T3WORK_PROJECT_SKILLS_ROOT,
  T3WORK_PROJECT_STATUS_SKILL_PATH,
  T3WORK_PROJECT_TEMPLATES_ROOT,
  type T3WorkProjectSetupFile,
  type T3WorkProjectSetupManagedFileHashes,
} from "./t3work-projectSetupShared.ts";
import {
  buildT3WorkProjectAgentsManagedRefresh,
  buildT3WorkProjectSetupProfileManifest,
} from "./t3work-projectSetupManagedRefresh.ts";

export {
  DEFAULT_T3WORK_PROJECT_SETUP_PROFILE_ID,
  T3WORK_PROJECT_CLAUDE_PATH,
  resolveT3WorkProjectSetupProfile,
  resolveT3WorkProjectSetupProfileId,
  T3WORK_PROJECT_AGENTS_PATH,
  T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH,
  T3WORK_PROJECT_PROFILE_MANIFEST_PATH,
} from "./t3work-projectSetupShared.ts";

export {
  createT3WorkProjectSetupContentHash,
  readPersistedT3WorkProjectSetupState,
  resolveT3WorkProjectSetupWriteDecision,
} from "./t3work-projectSetupManagedRefresh.ts";

export function renderT3WorkProjectSetupFiles(input?: {
  readonly profileId?: string;
  readonly enabledSkillPackIds?: ReadonlyArray<string>;
  readonly customProfile?: import("@t3tools/t3work-skill-packs").T3WorkProfile;
  readonly managedFileHashes?: T3WorkProjectSetupManagedFileHashes;
}): ReadonlyArray<T3WorkProjectSetupFile> {
  const resolved = resolveT3WorkProjectSetupProfile({
    ...((input?.customProfile?.id ?? input?.profileId)
      ? { profileId: input?.customProfile?.id ?? input?.profileId }
      : {}),
    ...(input?.enabledSkillPackIds ? { enabledSkillPackIds: input.enabledSkillPackIds } : {}),
    ...(input?.customProfile
      ? { projectLocalProfiles: { [input.customProfile.id]: input.customProfile } }
      : {}),
  });
  const profile = resolved.profile;
  const instructionContents = renderAgentsMd(profile);
  const files: T3WorkProjectSetupFile[] = [
    {
      relativePath: T3WORK_PROJECT_AGENTS_PATH,
      contents: instructionContents,
      writeMode: "if-missing",
      managedRefresh: buildT3WorkProjectAgentsManagedRefresh(profile),
    },
    {
      relativePath: T3WORK_PROJECT_CLAUDE_PATH,
      contents: instructionContents,
      writeMode: "if-missing",
      managedRefresh: buildT3WorkProjectAgentsManagedRefresh(profile),
    },
    {
      relativePath: T3WORK_PROJECT_PROFILE_MANIFEST_PATH,
      contents: jsonFile(
        buildT3WorkProjectSetupProfileManifest(profile, {
          enabledSkillPackIds: resolved.enabledSkillPackIds,
          ...(input?.managedFileHashes ? { managedFileHashes: input.managedFileHashes } : {}),
        }),
      ),
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
    ...renderBundledRecipeSetupFiles(),
    {
      relativePath: `${T3WORK_PROJECT_SKILLS_ROOT}/README.md`,
      contents: renderSkillsReadme(),
      writeMode: "if-missing",
    },
    {
      relativePath: T3WORK_PROJECT_STATUS_SKILL_PATH,
      contents: renderStatusAndContextSkill(),
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

  // The change-request assessment workflow is a Requirements-Engineer skill, so it
  // only ships into projects set up with that profile.
  if (profile.id === "requirements-engineer") {
    files.push(
      {
        relativePath: `${T3WORK_PROJECT_SKILLS_ROOT}/change-request-assessment/SKILL.md`,
        contents: renderChangeRequestAssessmentSkill(),
        writeMode: "if-missing",
      },
      {
        relativePath: `${T3WORK_PROJECT_SKILLS_ROOT}/change-request-assessment/assessment-template.md`,
        contents: renderChangeRequestAssessmentTemplate(),
        writeMode: "if-missing",
      },
    );
  }

  if (input?.customProfile && !isBundledT3WorkProfileId(input.customProfile.id)) {
    files.push({
      relativePath: buildProjectLocalProfilePath(input.customProfile.id),
      contents: jsonFile(input.customProfile),
      writeMode: "overwrite",
    });
  }

  return files;
}
