import type { RecipeProfileContext, SidecarComposition } from "@t3tools/project-recipes";

export type BundledT3WorkProfileId =
  | "requirements-engineer"
  | "product-owner"
  | "project-lead"
  | "scrum-master"
  | "developer"
  | "test-manager"
  | "cloud-engineer"
  | "system-administrator"
  | "security-engineer"
  | "service-manager"
  | "steering-member";

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

export const DEFAULT_T3WORK_PROFILE_ID: BundledT3WorkProfileId = "product-owner";

// Delivery-role profiles (see specs/roles/*.md). Identity, communication style, surface
// defaults, tags, and preferred artifact kinds follow each role spec. The engine-coupled
// fields — defaultActionFamilies, defaultRecipeWeights, recommendedSkillPackIds — use the
// existing recipe/pack vocabulary (the role spec's "what serves this role today" mapping),
// because the recipe matcher gates and scores on that vocabulary. The aspirational action
// families / recipes / packs the specs propose are not implemented yet.
export const T3WORK_PROFILES: Record<BundledT3WorkProfileId, T3WorkProfile> = {
  "requirements-engineer": {
    id: "requirements-engineer",
    title: "Requirements Engineer",
    description:
      "Requirement clarity, acceptance criteria, and ambiguity checks with traceability in mind.",
    audience: "product",
    tags: ["requirements", "analysis", "specification"],
    communicationStyle: { technicalDepth: "medium", brevity: "balanced", guidanceStyle: "balanced" },
    surfaceDefaults: {
      detailDensity: "balanced",
      activityOrder: "newest-first",
      collapseLowSignalEvents: true,
    },
    preferredArtifactKinds: [
      "requirement-spec",
      "acceptance-criteria",
      "ambiguity-list",
      "open-question-list",
      "traceability-matrix",
    ],
    defaultActionFamilies: ["product", "summary", "verification"],
    defaultRecipeWeights: {
      "review-acceptance-criteria": 35,
      "explain-selected-work": 25,
      "create-qa-test-plan": 10,
      "summarize-project-risk": 5,
    },
    recommendedSkillPackIds: ["product", "qa"],
    hideImplementationComplexity: true,
  },
  "product-owner": {
    id: "product-owner",
    title: "Product Owner",
    description:
      "Backlog refinement, prioritization rationale, and stakeholder-ready value framing.",
    audience: "product",
    tags: ["product", "backlog", "prioritization"],
    communicationStyle: { technicalDepth: "low", brevity: "short", guidanceStyle: "guided" },
    surfaceDefaults: {
      detailDensity: "guided",
      activityOrder: "newest-first",
      collapseLowSignalEvents: true,
    },
    preferredArtifactKinds: ["summary", "decision-notes", "open-questions", "status-update"],
    defaultActionFamilies: ["product", "delivery", "summary"],
    defaultRecipeWeights: {
      "stakeholder-update": 30,
      "explain-selected-work": 25,
      "review-acceptance-criteria": 20,
      "shape-next-backlog-slice": 20,
      "summarize-project-risk": 10,
      "tshirt-size-epic": 10,
    },
    recommendedSkillPackIds: ["product", "delivery"],
    hideImplementationComplexity: true,
  },
  "project-lead": {
    id: "project-lead",
    title: "Project Lead",
    description: "Concise status, blockers, dependencies, and milestone / release coordination.",
    audience: "delivery",
    tags: ["delivery", "coordination", "planning"],
    communicationStyle: { technicalDepth: "low", brevity: "short", guidanceStyle: "guided" },
    surfaceDefaults: {
      detailDensity: "guided",
      activityOrder: "newest-first",
      collapseLowSignalEvents: true,
    },
    preferredArtifactKinds: [
      "status-report",
      "risk-register",
      "dependency-map",
      "milestone-plan",
      "standup-summary",
    ],
    defaultActionFamilies: ["delivery", "release"],
    defaultRecipeWeights: {
      "draft-status-update": 30,
      "release-handoff-checklist": 25,
      "summarize-project-risk": 20,
      "focus-needs-my-action": 15,
      "unblock-blocked-ticket": 10,
    },
    recommendedSkillPackIds: ["delivery", "release"],
    hideImplementationComplexity: true,
  },
  "scrum-master": {
    id: "scrum-master",
    title: "Scrum Master",
    description: "Sprint health, impediment removal, and concise team-facing flow updates.",
    audience: "delivery",
    tags: ["agile", "facilitation", "delivery"],
    communicationStyle: { technicalDepth: "low", brevity: "short", guidanceStyle: "guided" },
    surfaceDefaults: {
      detailDensity: "guided",
      activityOrder: "newest-first",
      collapseLowSignalEvents: true,
    },
    preferredArtifactKinds: [
      "sprint-health",
      "impediment-list",
      "ceremony-notes",
      "status-update",
      "blocker-list",
    ],
    defaultActionFamilies: ["delivery", "summary"],
    defaultRecipeWeights: {
      "draft-status-update": 30,
      "focus-needs-my-action": 20,
      "unblock-my-work": 15,
      "shape-next-backlog-slice": 10,
    },
    recommendedSkillPackIds: ["delivery"],
    hideImplementationComplexity: true,
  },
  developer: {
    id: "developer",
    title: "Developer",
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
    defaultActionFamilies: ["engineering", "verification", "release"],
    defaultRecipeWeights: {
      "technical-implementation-plan": 40,
      "address-linked-pr-feedback": 20,
      "release-handoff-checklist": 10,
      "next-best-task": 10,
      "review-acceptance-criteria": 10,
    },
    sidecarSections: {
      sections: [{ sectionId: "recent-conversations" }, { sectionId: "quick-starts" }],
    },
    recommendedSkillPackIds: ["engineering", "release"],
    hideImplementationComplexity: false,
  },
  "test-manager": {
    id: "test-manager",
    title: "Test Manager",
    description: "Test strategy, coverage, quality gates, and defect-risk oversight.",
    audience: "qa",
    tags: ["quality", "test-management", "qa"],
    communicationStyle: { technicalDepth: "medium", brevity: "balanced", guidanceStyle: "balanced" },
    surfaceDefaults: {
      detailDensity: "balanced",
      activityOrder: "newest-first",
      collapseLowSignalEvents: true,
    },
    preferredArtifactKinds: [
      "test-strategy",
      "test-plan",
      "coverage-matrix",
      "quality-gate-report",
      "defect-risk-summary",
    ],
    defaultActionFamilies: ["qa", "verification", "release"],
    defaultRecipeWeights: {
      "create-qa-test-plan": 35,
      "review-acceptance-criteria": 20,
      "release-handoff-checklist": 10,
      "summarize-project-risk": 10,
    },
    recommendedSkillPackIds: ["qa", "release"],
    hideImplementationComplexity: true,
  },
  "cloud-engineer": {
    id: "cloud-engineer",
    title: "Cloud Engineer",
    description:
      "Infrastructure-as-code changes, rollout planning, and verification with rollback-first defaults.",
    audience: "engineering",
    tags: ["infrastructure", "cloud", "platform", "engineering"],
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
      "infra-plan",
      "deployment-checklist",
      "runbook",
      "verification-plan",
      "rollback-plan",
    ],
    defaultActionFamilies: ["engineering", "release", "verify"],
    defaultRecipeWeights: {
      "technical-implementation-plan": 40,
      "release-handoff-checklist": 15,
      "next-best-task": 10,
    },
    recommendedSkillPackIds: ["engineering", "release"],
    hideImplementationComplexity: false,
  },
  "system-administrator": {
    id: "system-administrator",
    title: "System Administrator",
    description:
      "Maintenance, patching, access reviews, and operational runbooks with safety-first procedures.",
    audience: "engineering",
    tags: ["operations", "sysadmin", "maintenance", "infrastructure"],
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
      "runbook",
      "maintenance-checklist",
      "access-review",
      "incident-summary",
      "change-record",
    ],
    defaultActionFamilies: ["engineering", "release", "verify"],
    defaultRecipeWeights: {
      "technical-implementation-plan": 35,
      "release-handoff-checklist": 15,
      "support-escalation-summary": 10,
    },
    recommendedSkillPackIds: ["engineering", "release"],
    hideImplementationComplexity: false,
  },
  "security-engineer": {
    id: "security-engineer",
    title: "Security Engineer",
    description:
      "Threat modeling, security review, and risk-ranked remediation with evidence-first framing.",
    audience: "engineering",
    tags: ["security", "appsec", "risk", "engineering"],
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
      "threat-model",
      "security-review",
      "vulnerability-report",
      "remediation-plan",
      "risk-list",
    ],
    defaultActionFamilies: ["engineering", "review", "verify"],
    defaultRecipeWeights: {
      "review-acceptance-criteria": 25,
      "address-linked-pr-feedback": 20,
      "technical-implementation-plan": 20,
      "summarize-project-risk": 10,
    },
    recommendedSkillPackIds: ["engineering"],
    hideImplementationComplexity: false,
  },
  "service-manager": {
    id: "service-manager",
    title: "Service Manager",
    description:
      "SLAs, incident and escalation oversight, and customer-facing service status, impact-first.",
    audience: "support",
    tags: ["service-management", "itil", "operations", "support"],
    communicationStyle: { technicalDepth: "low", brevity: "short", guidanceStyle: "guided" },
    surfaceDefaults: {
      detailDensity: "guided",
      activityOrder: "newest-first",
      collapseLowSignalEvents: true,
    },
    preferredArtifactKinds: [
      "sla-report",
      "service-review",
      "incident-summary",
      "escalation-summary",
      "status-update",
    ],
    defaultActionFamilies: ["support", "summary"],
    defaultRecipeWeights: {
      "support-escalation-summary": 35,
      "draft-status-update": 15,
      "stakeholder-update": 10,
      "summarize-project-risk": 10,
    },
    recommendedSkillPackIds: ["support", "delivery"],
    hideImplementationComplexity: true,
  },
  "steering-member": {
    id: "steering-member",
    title: "Steering Member",
    description:
      "Executive summaries, decision briefs, and portfolio-level risk for go / no-go decisions.",
    audience: "delivery",
    tags: ["governance", "executive", "oversight"],
    communicationStyle: { technicalDepth: "low", brevity: "short", guidanceStyle: "expert" },
    surfaceDefaults: {
      detailDensity: "guided",
      activityOrder: "newest-first",
      collapseLowSignalEvents: true,
    },
    preferredArtifactKinds: [
      "executive-summary",
      "decision-brief",
      "portfolio-risk",
      "budget-schedule-overview",
      "escalation-summary",
    ],
    defaultActionFamilies: ["delivery", "summary"],
    defaultRecipeWeights: {
      "summarize-project-risk": 30,
      "draft-status-update": 20,
      "stakeholder-update": 20,
    },
    recommendedSkillPackIds: ["delivery"],
    hideImplementationComplexity: true,
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

export function resolveT3WorkProfile(
  input: ResolveT3WorkProfileInput = {},
): T3WorkProfileResolution {
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
  if (
    input.manifest?.profileId === requestedProfileId &&
    input.manifest.title &&
    input.manifest.description
  ) {
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
      typeof record.audience === "string" ? (record.audience as T3WorkProfileAudience) : "mixed",
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
