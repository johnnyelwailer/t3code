import {
  buildProjectLocalProfilePath,
  isBundledT3TeamProfileId,
} from "@t3tools/t3team-skill-packs";

import {
  jsonFile,
  renderAgentsMd,
  renderContextEntrypointPlaceholder,
  renderContextReadme,
  renderRecipeTemplate,
  renderRecipesReadme,
  renderSkillTemplate,
  renderSkillsReadme,
} from "./t3team-projectSetupContent.ts";
import { renderRecipeAuthoringGuide } from "./t3team-projectSetupContentAuthoring.ts";
import { renderBundledRecipeSetupFiles } from "./t3team-projectSetupRecipes.ts";
import { renderStatusAndContextSkill } from "./t3team-projectSetupStatusSkill.ts";
import {
  T3TEAM_PROJECT_CLAUDE_PATH,
  resolveT3TeamProjectSetupProfile,
  T3TEAM_PROJECT_AGENTS_PATH,
  T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH,
  T3TEAM_PROJECT_CONTEXT_ROOT,
  T3TEAM_PROJECT_PROFILE_MANIFEST_PATH,
  T3TEAM_PROJECT_RECIPES_ROOT,
  T3TEAM_PROJECT_SKILLS_ROOT,
  T3TEAM_PROJECT_STATUS_SKILL_PATH,
  T3TEAM_PROJECT_TEMPLATES_ROOT,
  type T3TeamProjectSetupFile,
  type T3TeamProjectSetupManagedFileHashes,
} from "./t3team-projectSetupShared.ts";
import {
  buildT3TeamProjectAgentsManagedRefresh,
  buildT3TeamProjectSetupProfileManifest,
} from "./t3team-projectSetupManagedRefresh.ts";

export {
  DEFAULT_T3TEAM_PROJECT_SETUP_PROFILE_ID,
  T3TEAM_PROJECT_CLAUDE_PATH,
  resolveT3TeamProjectSetupProfile,
  resolveT3TeamProjectSetupProfileId,
  T3TEAM_PROJECT_AGENTS_PATH,
  T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH,
  T3TEAM_PROJECT_PROFILE_MANIFEST_PATH,
} from "./t3team-projectSetupShared.ts";

export {
  createT3TeamProjectSetupContentHash,
  readPersistedT3TeamProjectSetupState,
  resolveT3TeamProjectSetupWriteDecision,
} from "./t3team-projectSetupManagedRefresh.ts";

export function renderT3TeamProjectSetupFiles(input?: {
  readonly profileId?: string;
  readonly enabledSkillPackIds?: ReadonlyArray<string>;
  readonly customProfile?: import("@t3tools/t3team-skill-packs").T3TeamProfile;
  readonly managedFileHashes?: T3TeamProjectSetupManagedFileHashes;
}): ReadonlyArray<T3TeamProjectSetupFile> {
  const resolved = resolveT3TeamProjectSetupProfile({
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
  const files: T3TeamProjectSetupFile[] = [
    {
      relativePath: T3TEAM_PROJECT_AGENTS_PATH,
      contents: instructionContents,
      writeMode: "if-missing",
      managedRefresh: buildT3TeamProjectAgentsManagedRefresh(profile),
    },
    {
      relativePath: T3TEAM_PROJECT_CLAUDE_PATH,
      contents: instructionContents,
      writeMode: "if-missing",
      managedRefresh: buildT3TeamProjectAgentsManagedRefresh(profile),
    },
    {
      relativePath: T3TEAM_PROJECT_PROFILE_MANIFEST_PATH,
      contents: jsonFile(
        buildT3TeamProjectSetupProfileManifest(profile, {
          enabledSkillPackIds: resolved.enabledSkillPackIds,
          ...(input?.managedFileHashes ? { managedFileHashes: input.managedFileHashes } : {}),
        }),
      ),
      writeMode: "overwrite",
    },
    {
      relativePath: `${T3TEAM_PROJECT_CONTEXT_ROOT}/README.md`,
      contents: renderContextReadme(),
      writeMode: "if-missing",
    },
    {
      relativePath: T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH,
      contents: renderContextEntrypointPlaceholder(),
      writeMode: "if-missing",
    },
    {
      relativePath: `${T3TEAM_PROJECT_RECIPES_ROOT}/README.md`,
      contents: renderRecipesReadme(),
      writeMode: "if-missing",
    },
    {
      relativePath: `${T3TEAM_PROJECT_RECIPES_ROOT}/AUTHORING.md`,
      contents: renderRecipeAuthoringGuide(),
      writeMode: "if-missing",
    },
    ...renderBundledRecipeSetupFiles(),
    {
      relativePath: `${T3TEAM_PROJECT_SKILLS_ROOT}/README.md`,
      contents: renderSkillsReadme(),
      writeMode: "if-missing",
    },
    {
      relativePath: T3TEAM_PROJECT_STATUS_SKILL_PATH,
      contents: renderStatusAndContextSkill(),
      writeMode: "if-missing",
    },
    {
      relativePath: `${T3TEAM_PROJECT_TEMPLATES_ROOT}/recipes/repeatable-workflow.md`,
      contents: renderRecipeTemplate(profile),
      writeMode: "if-missing",
    },
    {
      relativePath: `${T3TEAM_PROJECT_TEMPLATES_ROOT}/skills/repeatable-workflow/SKILL.md`,
      contents: renderSkillTemplate(profile),
      writeMode: "if-missing",
    },
  ];

  if (input?.customProfile && !isBundledT3TeamProfileId(input.customProfile.id)) {
    files.push({
      relativePath: buildProjectLocalProfilePath(input.customProfile.id),
      contents: jsonFile(input.customProfile),
      writeMode: "overwrite",
    });
  }

  return files;
}
