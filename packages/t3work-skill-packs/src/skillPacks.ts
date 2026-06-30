import type { T3WorkProfileId } from "./profiles.js";

export type T3WorkSkillPack = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly defaultProfileId?: T3WorkProfileId;
  readonly recipeIds: ReadonlyArray<string>;
  readonly actionRecipeIds?: ReadonlyArray<string>;
  readonly promptBlockIds: ReadonlyArray<string>;
  readonly artifactTemplateIds: ReadonlyArray<string>;
  readonly allowedToolGroups: ReadonlyArray<string>;
};

export const T3WORK_SKILL_PACKS: Record<string, T3WorkSkillPack> = {
  qa: {
    id: "qa",
    title: "QA",
    description: "Test planning, acceptance review, and validation workflows.",
    defaultProfileId: "test-manager",
    recipeIds: [
      "review-acceptance-criteria",
      "create-qa-test-plan",
      "draft-jira-comment",
      "summarize-project-risk",
    ],
    promptBlockIds: [],
    artifactTemplateIds: ["test-matrix", "risk-list"],
    allowedToolGroups: ["integration.read", "artifact.rw", "ui.render"],
  },
  product: {
    id: "product",
    title: "Product",
    description: "Requirement summaries, ambiguity review, and stakeholder-ready framing.",
    defaultProfileId: "product-owner",
    recipeIds: [
      "explain-selected-work",
      "review-acceptance-criteria",
      "stakeholder-update",
      "summarize-project-risk",
    ],
    promptBlockIds: [],
    artifactTemplateIds: ["summary", "decision-notes"],
    allowedToolGroups: ["integration.read", "artifact.rw", "ui.render"],
  },
  support: {
    id: "support",
    title: "Support",
    description: "Customer-facing issue summaries, escalation drafts, and triage workflows.",
    defaultProfileId: "service-manager",
    recipeIds: ["support-escalation-summary", "draft-jira-comment", "explain-selected-work"],
    promptBlockIds: [],
    artifactTemplateIds: ["escalation-summary", "impact-summary"],
    allowedToolGroups: ["integration.read", "artifact.rw", "ui.render"],
  },
  delivery: {
    id: "delivery",
    title: "Delivery",
    description: "Status updates, blockers, dependencies, and coordination checklists.",
    defaultProfileId: "project-lead",
    recipeIds: [
      "draft-status-update",
      "summarize-project-risk",
      "next-best-task",
      "release-handoff-checklist",
    ],
    promptBlockIds: [],
    artifactTemplateIds: ["status-update", "checklist"],
    allowedToolGroups: ["integration.read", "artifact.rw", "ui.render"],
  },
  engineering: {
    id: "engineering",
    title: "Engineering",
    description: "Implementation planning, repo-aware checklists, and technical guidance.",
    defaultProfileId: "developer",
    recipeIds: ["technical-implementation-plan", "review-acceptance-criteria", "next-best-task"],
    promptBlockIds: [],
    artifactTemplateIds: ["implementation-plan", "technical-checklist"],
    allowedToolGroups: ["integration.read", "artifact.rw", "ui.render"],
  },
  release: {
    id: "release",
    title: "Release",
    description: "Release readiness, verification, deployment context, and handoff workflows.",
    defaultProfileId: "test-manager",
    recipeIds: ["release-handoff-checklist", "draft-status-update", "summarize-project-risk"],
    promptBlockIds: [],
    artifactTemplateIds: ["checklist", "handoff-note"],
    allowedToolGroups: ["integration.read", "artifact.rw", "ui.render"],
  },
};

export function listT3WorkSkillPacks(): ReadonlyArray<T3WorkSkillPack> {
  return Object.values(T3WORK_SKILL_PACKS);
}

export function getT3WorkSkillPack(skillPackId: string): T3WorkSkillPack | undefined {
  return T3WORK_SKILL_PACKS[skillPackId];
}
