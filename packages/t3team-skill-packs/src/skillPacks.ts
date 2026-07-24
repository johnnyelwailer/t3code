import type { T3TeamProfileId } from "./profiles.js";

export type T3TeamSkillPack = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly defaultProfileId?: T3TeamProfileId;
  readonly recipeIds: ReadonlyArray<string>;
  readonly actionRecipeIds?: ReadonlyArray<string>;
  readonly promptBlockIds: ReadonlyArray<string>;
  readonly artifactTemplateIds: ReadonlyArray<string>;
  readonly allowedToolGroups: ReadonlyArray<string>;
};

export const T3TEAM_SKILL_PACKS: Record<string, T3TeamSkillPack> = {
  qa: {
    id: "qa",
    title: "QA",
    description: "Test planning, acceptance review, and validation workflows.",
    defaultProfileId: "qa-assistant",
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
    defaultProfileId: "product-partner",
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
    defaultProfileId: "support-triage",
    recipeIds: ["support-escalation-summary", "draft-jira-comment", "explain-selected-work"],
    promptBlockIds: [],
    artifactTemplateIds: ["escalation-summary", "impact-summary"],
    allowedToolGroups: ["integration.read", "artifact.rw", "ui.render"],
  },
  delivery: {
    id: "delivery",
    title: "Delivery",
    description: "Status updates, blockers, dependencies, and coordination checklists.",
    defaultProfileId: "delivery-coordinator",
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
    defaultProfileId: "engineering-copilot",
    recipeIds: ["technical-implementation-plan", "review-acceptance-criteria", "next-best-task"],
    promptBlockIds: [],
    artifactTemplateIds: ["implementation-plan", "technical-checklist"],
    allowedToolGroups: ["integration.read", "artifact.rw", "ui.render"],
  },
  release: {
    id: "release",
    title: "Release",
    description: "Release readiness, verification, deployment context, and handoff workflows.",
    defaultProfileId: "verification-guide",
    recipeIds: ["release-handoff-checklist", "draft-status-update", "summarize-project-risk"],
    promptBlockIds: [],
    artifactTemplateIds: ["checklist", "handoff-note"],
    allowedToolGroups: ["integration.read", "artifact.rw", "ui.render"],
  },
};

export function listT3TeamSkillPacks(): ReadonlyArray<T3TeamSkillPack> {
  return Object.values(T3TEAM_SKILL_PACKS);
}

export function getT3TeamSkillPack(skillPackId: string): T3TeamSkillPack | undefined {
  return T3TEAM_SKILL_PACKS[skillPackId];
}
