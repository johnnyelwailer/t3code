export const T3WORK_PROJECT_SETUP_VERSION = 1;
export const T3WORK_PROJECT_SETUP_ROOT = ".t3work/setup";
export const T3WORK_PROJECT_CONTEXT_ROOT = ".t3work/context";
export const T3WORK_PROJECT_SKILLS_ROOT = ".t3work/skills";
export const T3WORK_PROJECT_RECIPES_ROOT = ".t3work/recipes";
export const T3WORK_PROJECT_TEMPLATES_ROOT = ".t3work/templates";
export const T3WORK_PROJECT_PROFILE_MANIFEST_PATH = `${T3WORK_PROJECT_SETUP_ROOT}/profile.json`;
export const T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH = `${T3WORK_PROJECT_CONTEXT_ROOT}/entrypoint.json`;

export type T3WorkProjectSetupProfileId =
  | "project-partner"
  | "test-engineer"
  | "requirements-engineer"
  | "developer";

export type T3WorkProjectSetupProfileSummary = {
  readonly id: T3WorkProjectSetupProfileId;
  readonly title: string;
  readonly description: string;
  readonly audience: "mixed" | "qa" | "product" | "engineering";
  readonly communicationStyle: {
    readonly technicalDepth: "low" | "medium" | "high";
    readonly brevity: "short" | "balanced" | "detailed";
    readonly hideImplementationComplexity: boolean;
  };
  readonly recommendedSkillPackIds: ReadonlyArray<string>;
};

export const DEFAULT_T3WORK_PROJECT_SETUP_PROFILE_ID: T3WorkProjectSetupProfileId =
  "project-partner";

const PROFILE_DEFINITIONS: Record<T3WorkProjectSetupProfileId, T3WorkProjectSetupProfileSummary> = {
  "project-partner": {
    id: "project-partner",
    title: "Project Partner",
    description: "Short, plain-language guidance for non-technical project work.",
    audience: "mixed",
    communicationStyle: {
      technicalDepth: "low",
      brevity: "short",
      hideImplementationComplexity: true,
    },
    recommendedSkillPackIds: ["product", "delivery"],
  },
  "test-engineer": {
    id: "test-engineer",
    title: "Test Engineer",
    description: "Concise validation-focused guidance with clear risks and coverage gaps.",
    audience: "qa",
    communicationStyle: {
      technicalDepth: "medium",
      brevity: "short",
      hideImplementationComplexity: false,
    },
    recommendedSkillPackIds: ["qa", "delivery"],
  },
  "requirements-engineer": {
    id: "requirements-engineer",
    title: "Requirements Engineer",
    description: "Clear requirement framing, ambiguity checks, and decision-ready summaries.",
    audience: "product",
    communicationStyle: {
      technicalDepth: "low",
      brevity: "short",
      hideImplementationComplexity: true,
    },
    recommendedSkillPackIds: ["product", "delivery"],
  },
  developer: {
    id: "developer",
    title: "Developer",
    description: "Implementation-oriented setup with more technical depth and verification bias.",
    audience: "engineering",
    communicationStyle: {
      technicalDepth: "high",
      brevity: "balanced",
      hideImplementationComplexity: false,
    },
    recommendedSkillPackIds: ["engineering", "release"],
  },
};

export function resolveT3WorkProjectSetupProfileId(
  profileId: string | undefined,
): T3WorkProjectSetupProfileId {
  if (!profileId) {
    return DEFAULT_T3WORK_PROJECT_SETUP_PROFILE_ID;
  }
  return profileId in PROFILE_DEFINITIONS
    ? (profileId as T3WorkProjectSetupProfileId)
    : DEFAULT_T3WORK_PROJECT_SETUP_PROFILE_ID;
}

export function listT3WorkProjectSetupProfiles(): ReadonlyArray<T3WorkProjectSetupProfileSummary> {
  return Object.values(PROFILE_DEFINITIONS);
}
