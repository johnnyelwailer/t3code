import type { RecipeProfileContext, SidecarComposition } from "@t3tools/project-recipes";

export type BundledT3WorkProfileId =
  | "qa-assistant"
  | "product-partner"
  | "support-triage"
  | "delivery-coordinator"
  | "verification-guide"
  | "engineering-copilot";

export type T3WorkProfileId = string;

export type T3WorkProfileAudience =
  | "mixed"
  | "qa"
  | "product"
  | "support"
  | "delivery"
  | "engineering";

export type T3WorkProfile = {
  readonly id: T3WorkProfileId;
  readonly title: string;
  readonly description: string;
  readonly audience: T3WorkProfileAudience;
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

export type T3WorkProfileResolutionSource =
  | "bundled"
  | "project-local"
  | "manifest-inline"
  | "fallback";

export type T3WorkProfileResolution = {
  readonly profile: T3WorkProfile;
  readonly source: T3WorkProfileResolutionSource;
  readonly requestedProfileId?: string;
  readonly warning?: string;
};

export type T3WorkProjectProfileManifest = {
  readonly version: number;
  readonly profileId: T3WorkProfileId;
  readonly enabledSkillPackIds?: ReadonlyArray<string>;
  readonly title?: string;
  readonly description?: string;
  readonly audience?: T3WorkProfileAudience;
  readonly tags?: ReadonlyArray<string>;
  readonly communicationStyle?: T3WorkProfile["communicationStyle"];
  readonly surfaceDefaults?: T3WorkProfile["surfaceDefaults"];
  readonly preferredArtifactKinds?: ReadonlyArray<string>;
  readonly defaultActionFamilies?: ReadonlyArray<string>;
  readonly defaultRecipeWeights?: Readonly<Record<string, number>>;
  readonly sidecarSections?: SidecarComposition;
  readonly recommendedSkillPackIds?: ReadonlyArray<string>;
  readonly hideImplementationComplexity?: boolean;
  readonly managedFileHashes?: Readonly<Record<string, string>>;
};

export type ResolveT3WorkProfileInput = {
  readonly profileId?: string;
  readonly projectLocalProfiles?: Readonly<Record<string, T3WorkProfile>>;
  readonly manifest?: T3WorkProjectProfileManifest;
  readonly allowFallback?: boolean;
};

export const T3WORK_PROJECT_PROFILES_DIR = ".t3work/setup/profiles";
export const T3WORK_PROJECT_PROFILE_MANIFEST_PATH = ".t3work/setup/profile.json";

export const DEFAULT_T3WORK_PROFILE_ID: BundledT3WorkProfileId = "product-partner";

export const T3WORK_PROFILES: Record<BundledT3WorkProfileId, T3WorkProfile> = {
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

export function isBundledT3WorkProfileId(profileId: string): profileId is BundledT3WorkProfileId {
  return profileId in T3WORK_PROFILES;
}

function buildResolution(
  profile: T3WorkProfile,
  source: T3WorkProfileResolutionSource,
  requestedProfileId?: string,
  warning?: string,
): T3WorkProfileResolution {
  return {
    profile,
    source,
    ...(requestedProfileId ? { requestedProfileId } : {}),
    ...(warning ? { warning } : {}),
  };
}

export function resolveT3WorkProfile(input: ResolveT3WorkProfileInput = {}): T3WorkProfileResolution {
  const requestedProfileId = input.profileId?.trim();
  if (!requestedProfileId) {
    return buildResolution(T3WORK_PROFILES[DEFAULT_T3WORK_PROFILE_ID], "fallback");
  }
  if (isBundledT3WorkProfileId(requestedProfileId)) {
    return buildResolution(T3WORK_PROFILES[requestedProfileId], "bundled", requestedProfileId);
  }
  const projectLocalProfile = input.projectLocalProfiles?.[requestedProfileId];
  if (projectLocalProfile) {
    return buildResolution(projectLocalProfile, "project-local", requestedProfileId);
  }
  if (input.manifest?.profileId === requestedProfileId && input.manifest.title && input.manifest.description) {
    const manifestProfile = parseT3WorkProfileDefinition(input.manifest, requestedProfileId);
    if (manifestProfile) {
      return buildResolution(manifestProfile, "manifest-inline", requestedProfileId);
    }
  }
  if (input.allowFallback === false) {
    throw new Error(`Unknown profile id '${requestedProfileId}'.`);
  }
  const warning = `Unknown profile id '${requestedProfileId}'. Falling back to ${T3WORK_PROFILES[DEFAULT_T3WORK_PROFILE_ID].title}.`;
  return buildResolution(
    { ...T3WORK_PROFILES[DEFAULT_T3WORK_PROFILE_ID], id: requestedProfileId },
    "fallback",
    requestedProfileId,
    warning,
  );
}

export function resolveT3WorkProfileId(profileId: string | undefined): T3WorkProfileId {
  return resolveT3WorkProfile(profileId ? { profileId } : {}).profile.id;
}

export function getT3WorkProfile(
  profileId?: string,
  input?: Omit<ResolveT3WorkProfileInput, "profileId">,
): T3WorkProfile {
  return resolveT3WorkProfile({ ...input, ...(profileId ? { profileId } : {}) }).profile;
}

export function listT3WorkProfiles(): ReadonlyArray<T3WorkProfile> {
  return Object.values(T3WORK_PROFILES);
}

export function resolveEnabledSkillPackIds(input: {
  readonly profile: T3WorkProfile;
  readonly enabledSkillPackIds?: ReadonlyArray<string>;
}): ReadonlyArray<string> {
  const explicit = (input.enabledSkillPackIds ?? []).filter(
    (packId) => typeof packId === "string" && packId.trim().length > 0,
  );
  if (explicit.length > 0) return [...new Set(explicit)];
  return [...input.profile.recommendedSkillPackIds];
}

export function cloneBundledT3WorkProfile(
  sourceProfileId: string,
  customProfileId: string,
  overrides: Partial<
    Pick<
      T3WorkProfile,
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
): T3WorkProfile {
  const source = getT3WorkProfile(sourceProfileId);
  return {
    ...source,
    ...overrides,
    id: customProfileId,
    communicationStyle: { ...source.communicationStyle, ...overrides.communicationStyle },
  };
}

export function buildProjectLocalProfilePath(profileId: string): string {
  return `${T3WORK_PROJECT_PROFILES_DIR}/${profileId}.json`;
}

export function parseT3WorkProfileDefinition(
  value: unknown,
  fallbackId?: string,
): T3WorkProfile | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : fallbackId?.trim();
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const description = typeof record.description === "string" ? record.description.trim() : "";
  const style = record.communicationStyle;
  if (!id || !title || !description || !style || typeof style !== "object" || Array.isArray(style)) {
    return undefined;
  }
  const communicationStyle = style as T3WorkProfile["communicationStyle"];
  const preferredArtifactKinds = Array.isArray(record.preferredArtifactKinds)
    ? record.preferredArtifactKinds.filter((entry): entry is string => typeof entry === "string")
    : [];
  if (preferredArtifactKinds.length === 0) return undefined;
  return {
    id,
    title,
    description,
    audience:
      typeof record.audience === "string"
        ? (record.audience as T3WorkProfileAudience)
        : "mixed",
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

export function buildT3WorkProjectProfileManifest(input: {
  readonly profile: T3WorkProfile;
  readonly enabledSkillPackIds: ReadonlyArray<string>;
  readonly version?: number;
  readonly managedFileHashes?: Readonly<Record<string, string>>;
}): T3WorkProjectProfileManifest {
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
  profile: T3WorkProfile | string | undefined,
): RecipeProfileContext {
  const resolvedProfile =
    typeof profile === "string" || profile === undefined ? getT3WorkProfile(profile) : profile;
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
