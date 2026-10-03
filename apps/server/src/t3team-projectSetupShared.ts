import {
  T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH,
  T3TEAM_PROJECT_CONTEXT_ROOT,
} from "@t3tools/project-context/t3teamContextPaths";
import { PROJECT_STATE_DIR } from "@t3tools/project-context/t3teamProjectStateDir";
import {
  DEFAULT_T3TEAM_PROFILE_ID,
  resolveEnabledSkillPackIds,
  resolveT3TeamProfile,
  T3TEAM_PROFILES,
  T3TEAM_PROJECT_PROFILE_MANIFEST_PATH,
  type T3TeamProfile,
  type T3TeamProfileId,
  type T3TeamProjectProfileManifest,
} from "@t3tools/t3team-skill-packs";

import { getPackProfilesForResolver } from "./t3team-pack-setupProfileOverlay.ts";

export const T3TEAM_PROJECT_SETUP_VERSION = 1;
export const T3TEAM_PROJECT_AGENTS_PATH = "AGENTS.md";
export const T3TEAM_PROJECT_CLAUDE_PATH = "CLAUDE.md";
// State paths derive from the single state-dir resolver (`@t3tools/project-context`).
export { T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH, T3TEAM_PROJECT_CONTEXT_ROOT };
export { T3TEAM_PROJECT_PROFILE_MANIFEST_PATH };
export const T3TEAM_PROJECT_SKILLS_ROOT = `${PROJECT_STATE_DIR}/skills`;
export const T3TEAM_PROJECT_RECIPES_ROOT = `${PROJECT_STATE_DIR}/recipes`;
export const T3TEAM_PROJECT_TEMPLATES_ROOT = `${PROJECT_STATE_DIR}/templates`;
export const T3TEAM_PROJECT_STATUS_SKILL_PATH = `${T3TEAM_PROJECT_SKILLS_ROOT}/status-and-context-summary/SKILL.md`;

export type T3TeamProjectSetupProfileId = T3TeamProfileId;

export type T3TeamProjectSetupFile = {
  readonly relativePath: string;
  readonly contents: string;
  readonly writeMode?: "if-missing" | "overwrite";
  readonly managedRefresh?: {
    readonly knownContentHashes?: ReadonlyArray<string>;
  };
};

export type T3TeamProjectSetupManagedFileHashes = Readonly<Record<string, string>>;

export type ProjectSetupProfileDefinition = T3TeamProfile;

export type T3TeamProjectSetupProfileManifest = T3TeamProjectProfileManifest;

export const DEFAULT_T3TEAM_PROJECT_SETUP_PROFILE_ID: T3TeamProjectSetupProfileId =
  DEFAULT_T3TEAM_PROFILE_ID;

const T3TEAM_PROJECT_SETUP_PROFILES = T3TEAM_PROFILES;

export function resolveT3TeamProjectSetupProfileId(
  profileId: string | undefined,
): T3TeamProjectSetupProfileId {
  const packProfiles = getPackProfilesForResolver();
  return resolveT3TeamProfile({
    ...(profileId ? { profileId } : {}),
    ...(packProfiles ? { packProfiles } : {}),
  }).profile.id;
}

export function resolveT3TeamProjectSetupProfile(input: {
  readonly profileId?: string;
  readonly enabledSkillPackIds?: ReadonlyArray<string>;
  readonly projectLocalProfiles?: Readonly<Record<string, T3TeamProfile>>;
  readonly manifest?: T3TeamProjectProfileManifest;
}) {
  const packProfiles = getPackProfilesForResolver();
  const resolution = resolveT3TeamProfile({
    ...(input.profileId !== undefined ? { profileId: input.profileId } : {}),
    ...(input.projectLocalProfiles !== undefined
      ? { projectLocalProfiles: input.projectLocalProfiles }
      : {}),
    ...(packProfiles ? { packProfiles } : {}),
    ...(input.manifest !== undefined ? { manifest: input.manifest } : {}),
  });
  const packIds = input.enabledSkillPackIds ?? input.manifest?.enabledSkillPackIds;
  const enabledSkillPackIds = resolveEnabledSkillPackIds({
    profile: resolution.profile,
    ...(packIds !== undefined ? { enabledSkillPackIds: packIds } : {}),
  });

  return {
    ...resolution,
    enabledSkillPackIds,
  };
}
