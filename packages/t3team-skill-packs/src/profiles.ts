import type { RecipeProfileContext, SidecarComposition } from "@t3tools/project-recipes";

export type BundledT3TeamProfileId =
  | "qa-assistant"
  | "product-partner"
  | "support-triage"
  | "delivery-coordinator"
  | "verification-guide"
  | "engineering-copilot";

export type T3TeamProfileId = string;

export type T3TeamProfileAudience =
  | "mixed"
  | "qa"
  | "product"
  | "support"
  | "delivery"
  | "engineering";

export type T3TeamProfile = {
  readonly id: T3TeamProfileId;
  readonly title: string;
  readonly description: string;
  readonly audience: T3TeamProfileAudience;
  readonly tags?: ReadonlyArray<string>;
  readonly communicationStyle: {
    readonly technicalDepth: "low" | "medium" | "high";
    readonly brevity: "short" | "balanced" | "detailed";
    readonly guidanceStyle: "guided" | "balanced" | "expert";
    readonly defaultLanguage?: string;
  };
  readonly surfaceDefaults?: {
    readonly detailDensity: "guided" | "balanced" | "expert";
    readonly activityOrder?: "newest-first" | "oldest-first";
    readonly collapseLowSignalEvents?: boolean;
  };
  readonly preferredArtifactKinds: ReadonlyArray<string>;
  readonly defaultActionFamilies?: ReadonlyArray<string>;
  readonly defaultRecipeWeights: Readonly<Record<string, number>>;
  readonly sidecarSections?: SidecarComposition | undefined;
  readonly recommendedSkillPackIds: ReadonlyArray<string>;
  readonly hideImplementationComplexity: boolean;
};

export type T3TeamProfileResolutionSource =
  | "bundled"
  | "project-local"
  | "pack"
  | "manifest-inline"
  | "fallback";

export type T3TeamProfileResolution = {
  readonly profile: T3TeamProfile;
  readonly source: T3TeamProfileResolutionSource;
  readonly requestedProfileId?: string;
  readonly warning?: string;
};

export type T3TeamProjectProfileManifest = {
  readonly version: number;
  readonly profileId: T3TeamProfileId;
  readonly enabledSkillPackIds?: ReadonlyArray<string>;
  readonly title?: string;
  readonly description?: string;
  readonly audience?: T3TeamProfileAudience;
  readonly tags?: ReadonlyArray<string>;
  readonly communicationStyle?: T3TeamProfile["communicationStyle"];
  readonly surfaceDefaults?: T3TeamProfile["surfaceDefaults"];
  readonly preferredArtifactKinds?: ReadonlyArray<string>;
  readonly defaultActionFamilies?: ReadonlyArray<string>;
  readonly defaultRecipeWeights?: Readonly<Record<string, number>>;
  readonly sidecarSections?: SidecarComposition;
  readonly recommendedSkillPackIds?: ReadonlyArray<string>;
  readonly hideImplementationComplexity?: boolean;
  readonly managedFileHashes?: Readonly<Record<string, string>>;
};

export type ResolveT3TeamProfileInput = {
  readonly profileId?: string;
  readonly projectLocalProfiles?: Readonly<Record<string, T3TeamProfile>>;
  /** Profiles contributed by an active workspace pack, keyed by id. */
  readonly packProfiles?: Readonly<Record<string, T3TeamProfile>>;
  readonly manifest?: T3TeamProjectProfileManifest;
  readonly allowFallback?: boolean;
};

export const T3TEAM_PROJECT_PROFILES_DIR = ".t3team/setup/profiles";
export const T3TEAM_PROJECT_PROFILE_MANIFEST_PATH = ".t3team/setup/profile.json";

export const DEFAULT_T3TEAM_PROFILE_ID: BundledT3TeamProfileId = "product-partner";

export const T3TEAM_PROFILES: Record<BundledT3TeamProfileId, T3TeamProfile> = {
  "qa-assistant": {
    id: "qa-assistant",
    title: "QA Assistant",
    description: "Short verification guidance with test matrices, repro steps, and risk notes.",
    audience: "qa",
    tags: ["qa", "verification"],
    communicationStyle: { technicalDepth: "medium", brevity: "short", guidanceStyle: "guided" },
    surfaceDefaults: {
      detailDensity: "guided",
      activityOrder: "newest-first",
      collapseLowSignalEvents: true,
    },
    preferredArtifactKinds: [
      "test-matrix",
      "risk-list",
      "repro-steps",
      "open-questions",
      "checklist",
    ],
    defaultActionFamilies: ["qa", "verification", "delivery"],
    defaultRecipeWeights: {
      "create-qa-test-plan": 35,
      "review-acceptance-criteria": 20,
      "draft-jira-comment": 10,
      "release-handoff-checklist": 10,
    },
    recommendedSkillPackIds: ["qa", "delivery"],
    hideImplementationComplexity: true,
  },
  "product-partner": {
    id: "product-partner",
    title: "Product Partner",
    description: "Plain-language summaries, ambiguity checks, and stakeholder-ready updates.",
    audience: "product",
    tags: ["product", "planning"],
    communicationStyle: { technicalDepth: "low", brevity: "short", guidanceStyle: "guided" },
    surfaceDefaults: {
      detailDensity: "guided",
      activityOrder: "newest-first",
      collapseLowSignalEvents: true,
    },
    preferredArtifactKinds: ["summary", "decision-notes", "open-questions", "status-update"],
    defaultActionFamilies: ["product", "delivery", "summary"],
    defaultRecipeWeights: {
      "explain-selected-work": 25,
      "review-acceptance-criteria": 20,
      "stakeholder-update": 30,
      "summarize-project-risk": 10,
    },
    recommendedSkillPackIds: ["product", "delivery"],
    hideImplementationComplexity: true,
  },
  "support-triage": {
    id: "support-triage",
    title: "Support Triage",
    description: "Customer-readable issue framing with escalation and reproduction requests first.",
    audience: "support",
    tags: ["support", "triage"],
    communicationStyle: { technicalDepth: "low", brevity: "short", guidanceStyle: "guided" },
    surfaceDefaults: {
      detailDensity: "guided",
      activityOrder: "newest-first",
      collapseLowSignalEvents: true,
    },
    preferredArtifactKinds: [
      "escalation-summary",
      "impact-summary",
      "repro-steps",
      "status-update",
    ],
    defaultActionFamilies: ["support", "product"],
    defaultRecipeWeights: {
      "support-escalation-summary": 35,
      "draft-jira-comment": 15,
      "explain-selected-work": 10,
    },
    recommendedSkillPackIds: ["support", "qa"],
    hideImplementationComplexity: true,
  },
  "delivery-coordinator": {
    id: "delivery-coordinator",
    title: "Delivery Coordinator",
    description: "Concise status, blockers, dependencies, and release-checklist guidance.",
    audience: "delivery",
    tags: ["delivery", "release"],
    communicationStyle: { technicalDepth: "low", brevity: "short", guidanceStyle: "guided" },
    surfaceDefaults: {
      detailDensity: "guided",
      activityOrder: "newest-first",
      collapseLowSignalEvents: true,
    },
    preferredArtifactKinds: ["status-update", "blocker-list", "checklist", "timeline"],
    defaultActionFamilies: ["delivery", "release"],
    defaultRecipeWeights: {
      "draft-status-update": 30,
      "release-handoff-checklist": 25,
      "summarize-project-risk": 20,
    },
    recommendedSkillPackIds: ["delivery", "release"],
    hideImplementationComplexity: true,
  },
  "verification-guide": {
    id: "verification-guide",
    title: "Verification Guide",
    description:
      "Guided summaries with verification checklists, blockers, and deployment cues first.",
    audience: "qa",
    tags: ["verification", "release"],
    communicationStyle: {
      technicalDepth: "medium",
      brevity: "balanced",
      guidanceStyle: "guided",
    },
    surfaceDefaults: {
      detailDensity: "guided",
      activityOrder: "newest-first",
      collapseLowSignalEvents: false,
    },
    preferredArtifactKinds: ["checklist", "verification-plan", "risk-list", "handoff-note"],
    defaultActionFamilies: ["verification", "qa", "release"],
    defaultRecipeWeights: {
      "create-qa-test-plan": 25,
      "release-handoff-checklist": 20,
      "summarize-project-risk": 15,
    },
    recommendedSkillPackIds: ["qa", "release"],
    hideImplementationComplexity: false,
  },
  "engineering-copilot": {
    id: "engineering-copilot",
    title: "Engineering Copilot",
    description:
      "Technical implementation guidance with diff-first and verification-oriented defaults.",
    audience: "engineering",
    tags: ["engineering", "implementation"],
    communicationStyle: {
      technicalDepth: "high",
      brevity: "balanced",
      guidanceStyle: "expert",
    },
    surfaceDefaults: {
      detailDensity: "expert",
      activityOrder: "newest-first",
      collapseLowSignalEvents: false,
    },
    preferredArtifactKinds: [
      "implementation-plan",
      "technical-checklist",
      "verification-plan",
      "diff-summary",
    ],
    defaultActionFamilies: ["engineering", "release"],
    defaultRecipeWeights: {
      "technical-implementation-plan": 40,
      "release-handoff-checklist": 10,
      "next-best-task": 10,
    },
    sidecarSections: {
      sections: [{ sectionId: "recent-conversations" }, { sectionId: "quick-starts" }],
    },
    recommendedSkillPackIds: ["engineering", "release"],
    hideImplementationComplexity: false,
  },
};

export function isBundledT3TeamProfileId(profileId: string): profileId is BundledT3TeamProfileId {
  return profileId in T3TEAM_PROFILES;
}

function buildResolution(
  profile: T3TeamProfile,
  source: T3TeamProfileResolutionSource,
  requestedProfileId?: string,
  warning?: string,
): T3TeamProfileResolution {
  return {
    profile,
    source,
    ...(requestedProfileId ? { requestedProfileId } : {}),
    ...(warning ? { warning } : {}),
  };
}

export function resolveT3TeamProfile(
  input: ResolveT3TeamProfileInput = {},
): T3TeamProfileResolution {
  const requestedProfileId = input.profileId?.trim();
  if (!requestedProfileId) {
    return buildResolution(T3TEAM_PROFILES[DEFAULT_T3TEAM_PROFILE_ID], "fallback");
  }
  if (isBundledT3TeamProfileId(requestedProfileId)) {
    return buildResolution(T3TEAM_PROFILES[requestedProfileId], "bundled", requestedProfileId);
  }
  const projectLocalProfile = input.projectLocalProfiles?.[requestedProfileId];
  if (projectLocalProfile) {
    return buildResolution(projectLocalProfile, "project-local", requestedProfileId);
  }
  const packProfile = input.packProfiles?.[requestedProfileId];
  if (packProfile) {
    return buildResolution(packProfile, "pack", requestedProfileId);
  }
  if (
    input.manifest?.profileId === requestedProfileId &&
    input.manifest.title &&
    input.manifest.description
  ) {
    const manifestProfile = parseT3TeamProfileDefinition(input.manifest, requestedProfileId);
    if (manifestProfile) {
      return buildResolution(manifestProfile, "manifest-inline", requestedProfileId);
    }
  }
  if (input.allowFallback === false) {
    throw new Error(`Unknown profile id '${requestedProfileId}'.`);
  }
  const warning = `Unknown profile id '${requestedProfileId}'. Falling back to ${T3TEAM_PROFILES[DEFAULT_T3TEAM_PROFILE_ID].title}.`;
  return buildResolution(
    { ...T3TEAM_PROFILES[DEFAULT_T3TEAM_PROFILE_ID], id: requestedProfileId },
    "fallback",
    requestedProfileId,
    warning,
  );
}

export function resolveT3TeamProfileId(profileId: string | undefined): T3TeamProfileId {
  return resolveT3TeamProfile(profileId ? { profileId } : {}).profile.id;
}

export function getT3TeamProfile(
  profileId?: string,
  input?: Omit<ResolveT3TeamProfileInput, "profileId">,
): T3TeamProfile {
  return resolveT3TeamProfile({ ...input, ...(profileId ? { profileId } : {}) }).profile;
}

export function listT3TeamProfiles(): ReadonlyArray<T3TeamProfile> {
  return Object.values(T3TEAM_PROFILES);
}

export function resolveEnabledSkillPackIds(input: {
  readonly profile: T3TeamProfile;
  readonly enabledSkillPackIds?: ReadonlyArray<string>;
}): ReadonlyArray<string> {
  const explicit = (input.enabledSkillPackIds ?? []).filter(
    (packId) => typeof packId === "string" && packId.trim().length > 0,
  );
  if (explicit.length > 0) return [...new Set(explicit)];
  return [...input.profile.recommendedSkillPackIds];
}

export function cloneBundledT3TeamProfile(
  sourceProfileId: string,
  customProfileId: string,
  overrides: Partial<
    Pick<
      T3TeamProfile,
      | "title"
      | "description"
      | "communicationStyle"
      | "preferredArtifactKinds"
      | "defaultActionFamilies"
      | "defaultRecipeWeights"
      | "recommendedSkillPackIds"
      | "sidecarSections"
    >
  > = {},
): T3TeamProfile {
  const source = getT3TeamProfile(sourceProfileId);
  return {
    ...source,
    ...overrides,
    id: customProfileId,
    communicationStyle: { ...source.communicationStyle, ...overrides.communicationStyle },
  };
}

export function buildProjectLocalProfilePath(profileId: string): string {
  return `${T3TEAM_PROJECT_PROFILES_DIR}/${profileId}.json`;
}

export function parseT3TeamProfileDefinition(
  value: unknown,
  fallbackId?: string,
): T3TeamProfile | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : fallbackId?.trim();
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const description = typeof record.description === "string" ? record.description.trim() : "";
  const style = record.communicationStyle;
  if (
    !id ||
    !title ||
    !description ||
    !style ||
    typeof style !== "object" ||
    Array.isArray(style)
  ) {
    return undefined;
  }
  const communicationStyle = style as T3TeamProfile["communicationStyle"];
  const preferredArtifactKinds = Array.isArray(record.preferredArtifactKinds)
    ? record.preferredArtifactKinds.filter((entry): entry is string => typeof entry === "string")
    : [];
  if (preferredArtifactKinds.length === 0) return undefined;
  return {
    id,
    title,
    description,
    audience:
      typeof record.audience === "string" ? (record.audience as T3TeamProfileAudience) : "mixed",
    communicationStyle,
    preferredArtifactKinds,
    defaultRecipeWeights:
      record.defaultRecipeWeights && typeof record.defaultRecipeWeights === "object"
        ? (record.defaultRecipeWeights as Readonly<Record<string, number>>)
        : {},
    recommendedSkillPackIds: Array.isArray(record.recommendedSkillPackIds)
      ? record.recommendedSkillPackIds.filter((entry): entry is string => typeof entry === "string")
      : [],
    hideImplementationComplexity:
      typeof record.hideImplementationComplexity === "boolean"
        ? record.hideImplementationComplexity
        : false,
    ...(record.sidecarSections && typeof record.sidecarSections === "object"
      ? { sidecarSections: record.sidecarSections as SidecarComposition }
      : {}),
  };
}

export function buildT3TeamProjectProfileManifest(input: {
  readonly profile: T3TeamProfile;
  readonly enabledSkillPackIds: ReadonlyArray<string>;
  readonly version?: number;
  readonly managedFileHashes?: Readonly<Record<string, string>>;
}): T3TeamProjectProfileManifest {
  const { id, sidecarSections, ...profileFields } = input.profile;
  return {
    version: input.version ?? 1,
    profileId: id,
    enabledSkillPackIds: [...input.enabledSkillPackIds],
    ...profileFields,
    ...(sidecarSections ? { sidecarSections } : {}),
    ...(input.managedFileHashes && Object.keys(input.managedFileHashes).length > 0
      ? { managedFileHashes: input.managedFileHashes }
      : {}),
  };
}

export function toRecipeProfileContext(
  profile: T3TeamProfile | string | undefined,
): RecipeProfileContext {
  const resolvedProfile =
    typeof profile === "string" || profile === undefined ? getT3TeamProfile(profile) : profile;
  return {
    technicalDepth: resolvedProfile.communicationStyle.technicalDepth,
    brevity: resolvedProfile.communicationStyle.brevity,
    guidanceStyle: resolvedProfile.communicationStyle.guidanceStyle,
    detailDensity: resolvedProfile.surfaceDefaults?.detailDensity ?? "balanced",
    preferredArtifactKinds: resolvedProfile.preferredArtifactKinds,
    defaultActionFamilies: resolvedProfile.defaultActionFamilies ?? [],
    defaultRecipeWeights: resolvedProfile.defaultRecipeWeights,
  };
}
