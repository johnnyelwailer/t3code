import {
  DEFAULT_T3TEAM_PROFILE_ID,
  listT3TeamProfiles,
  resolveT3TeamProfileId,
  type T3TeamProfile,
  type T3TeamProfileId,
} from "@t3tools/t3team-skill-packs";

export const T3TEAM_PROJECT_SETUP_VERSION = 1;
export const T3TEAM_PROJECT_SETUP_ROOT = ".t3team/setup";
export const T3TEAM_PROJECT_CONTEXT_ROOT = ".t3team/context";
export const T3TEAM_PROJECT_SKILLS_ROOT = ".t3team/skills";
export const T3TEAM_PROJECT_RECIPES_ROOT = ".t3team/recipes";
export const T3TEAM_PROJECT_TEMPLATES_ROOT = ".t3team/templates";
export const T3TEAM_PROJECT_PROFILE_MANIFEST_PATH = `${T3TEAM_PROJECT_SETUP_ROOT}/profile.json`;
export const T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH = `${T3TEAM_PROJECT_CONTEXT_ROOT}/entrypoint.json`;

export type T3TeamProjectSetupProfileId = T3TeamProfileId;

export type T3TeamProjectSetupProfileSummary = T3TeamProfile;

export const DEFAULT_T3TEAM_PROJECT_SETUP_PROFILE_ID: T3TeamProjectSetupProfileId =
  DEFAULT_T3TEAM_PROFILE_ID;

export function resolveT3TeamProjectSetupProfileId(
  profileId: string | undefined,
): T3TeamProjectSetupProfileId {
  return resolveT3TeamProfileId(profileId);
}

export function listT3TeamProjectSetupProfiles(): ReadonlyArray<T3TeamProjectSetupProfileSummary> {
  return listT3TeamProfiles();
}
