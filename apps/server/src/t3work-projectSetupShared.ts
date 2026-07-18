import {
  DEFAULT_T3WORK_PROFILE_ID,
  resolveEnabledSkillPackIds,
  resolveT3WorkProfile,
  T3WORK_PROFILES,
  type T3WorkProfile,
  type T3WorkProfileId,
  type T3WorkProjectProfileManifest,
} from "@t3tools/t3work-skill-packs";

import { getPackProfilesForResolver } from "./t3work-pack-setupProfileOverlay.ts";

export const T3WORK_PROJECT_SETUP_VERSION = 1;
export const T3WORK_PROJECT_AGENTS_PATH = "AGENTS.md";
export const T3WORK_PROJECT_CLAUDE_PATH = "CLAUDE.md";
export const T3WORK_PROJECT_SETUP_ROOT = ".t3work/setup";
export const T3WORK_PROJECT_PROFILES_DIR = `${T3WORK_PROJECT_SETUP_ROOT}/profiles`;
export const T3WORK_PROJECT_CONTEXT_ROOT = ".t3work/context";
export const T3WORK_PROJECT_SKILLS_ROOT = ".t3work/skills";
export const T3WORK_PROJECT_RECIPES_ROOT = ".t3work/recipes";
export const T3WORK_PROJECT_TEMPLATES_ROOT = ".t3work/templates";
export const T3WORK_PROJECT_PROFILE_MANIFEST_PATH = `${T3WORK_PROJECT_SETUP_ROOT}/profile.json`;
export const T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH = `${T3WORK_PROJECT_CONTEXT_ROOT}/entrypoint.json`;
export const T3WORK_PROJECT_STATUS_SKILL_PATH = `${T3WORK_PROJECT_SKILLS_ROOT}/status-and-context-summary/SKILL.md`;

export type T3WorkProjectSetupProfileId = T3WorkProfileId;

export type T3WorkProjectSetupFile = {
  readonly relativePath: string;
  readonly contents: string;
  readonly writeMode?: "if-missing" | "overwrite";
  readonly managedRefresh?: {
    readonly knownContentHashes?: ReadonlyArray<string>;
  };
};

export type T3WorkProjectSetupManagedFileHashes = Readonly<Record<string, string>>;

export type ProjectSetupProfileDefinition = T3WorkProfile;

export type T3WorkProjectSetupProfileManifest = T3WorkProjectProfileManifest;

export const DEFAULT_T3WORK_PROJECT_SETUP_PROFILE_ID: T3WorkProjectSetupProfileId =
  DEFAULT_T3WORK_PROFILE_ID;

export const T3WORK_PROJECT_SETUP_PROFILES = T3WORK_PROFILES;

export function resolveT3WorkProjectSetupProfileId(
  profileId: string | undefined,
): T3WorkProjectSetupProfileId {
  const packProfiles = getPackProfilesForResolver();
  return resolveT3WorkProfile({
    ...(profileId ? { profileId } : {}),
    ...(packProfiles ? { packProfiles } : {}),
  }).profile.id;
}

export function resolveT3WorkProjectSetupProfile(input: {
  readonly profileId?: string;
  readonly enabledSkillPackIds?: ReadonlyArray<string>;
  readonly projectLocalProfiles?: Readonly<Record<string, T3WorkProfile>>;
  readonly manifest?: T3WorkProjectProfileManifest;
}) {
  const packProfiles = getPackProfilesForResolver();
  const resolution = resolveT3WorkProfile({
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
