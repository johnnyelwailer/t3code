import {
  T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH,
  T3TEAM_PROJECT_CONTEXT_ROOT,
} from "@t3tools/project-context/t3teamContextPaths";
import { PROJECT_STATE_DIR } from "@t3tools/project-context/t3teamProjectStateDir";
import {
  DEFAULT_T3TEAM_PROFILE_ID,
  listT3TeamProfiles,
  resolveT3TeamProfileId,
  T3TEAM_PROJECT_PROFILE_MANIFEST_PATH,
  type T3TeamProfile,
  type T3TeamProfileId,
} from "@t3tools/t3team-skill-packs";

export const T3TEAM_PROJECT_SETUP_VERSION = 1;
// Canonical state paths (the server maps them onto its configured state dir name).
export const T3TEAM_PROJECT_SETUP_ROOT = `${PROJECT_STATE_DIR}/setup`;
export { T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH, T3TEAM_PROJECT_CONTEXT_ROOT };
export const T3TEAM_PROJECT_SKILLS_ROOT = `${PROJECT_STATE_DIR}/skills`;
export const T3TEAM_PROJECT_RECIPES_ROOT = `${PROJECT_STATE_DIR}/recipes`;
export const T3TEAM_PROJECT_TEMPLATES_ROOT = `${PROJECT_STATE_DIR}/templates`;
export const T3TEAM_PROJECT_REFERENCES_MANIFEST_PATH = `${PROJECT_STATE_DIR}/references/reference-repositories.json`;
export { T3TEAM_PROJECT_PROFILE_MANIFEST_PATH };

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
