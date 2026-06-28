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
    defaultProfileId: "qa-assistant",
    recipeIds: ["review-acceptance-criteria", "create-qa-test-plan"],
    promptBlockIds: [],
    artifactTemplateIds: ["test-matrix", "risk-list"],
    allowedToolGroups: ["integration.read", "artifact.rw", "ui.render"],
  },
  product: {
    id: "product",
    title: "Product",
    description: "Requirement summaries, ambiguity review, and stakeholder-ready framing.",
    defaultProfileId: "product-partner",
    recipeIds: ["explain-selected-work", "review-acceptance-criteria"],
    promptBlockIds: [],
    artifactTemplateIds: ["summary", "decision-notes"],
    allowedToolGroups: ["integration.read", "artifact.rw", "ui.render"],
  },
  support: {
    id: "support",
    title: "Support",
    description: "Customer-facing issue summaries, escalation drafts, and triage workflows.",
    defaultProfileId: "support-triage",
    recipeIds: ["explain-selected-work", "review-acceptance-criteria"],
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
      "clear-filters",
      "focus-needs-my-action",
      "show-only-assigned-to-me",
      "shape-next-backlog-slice",
      "unblock-blocked-ticket",
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
    recipeIds: ["technical-implementation-plan", "review-acceptance-criteria", "tshirt-size-epic"],
    promptBlockIds: [],
    artifactTemplateIds: ["implementation-plan", "technical-checklist"],
    allowedToolGroups: ["integration.read", "artifact.rw", "ui.render"],
  },
  release: {
    id: "release",
    title: "Release",
    description: "Release readiness, verification, deployment context, and handoff workflows.",
    defaultProfileId: "verification-guide",
    recipeIds: ["review-acceptance-criteria", "create-qa-test-plan", "unblock-blocked-ticket"],
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
