import type { ProjectShellProject } from "@t3tools/project-context";
import type { ManagedProjectRecipe } from "@t3tools/project-recipes";

export const recipeManagerStoryProject = {
  id: "project-alpha",
  title: "Project Alpha",
  source: { provider: "atlassian", externalProjectId: "ALPHA" },
  workspace: { rootPath: "/workspace/project-alpha" },
} as ProjectShellProject;

const recipeBase = {
  version: "1.0.0",
  surfaces: ["project.dashboard.backlog"] as const,
  sourceKind: "recipe-json" as const,
  editable: true,
  deletable: true,
};

export const releaseChecklistRecipe: ManagedProjectRecipe = {
  ...recipeBase,
  id: "release-checklist",
  topic: "Release",
  displayName: "Release checklist",
  shortDescription: "Prepare a release checklist using the current project context.",
  active: true,
  recipePath: "/workspace/project-alpha/.t3work/recipes/release-checklist",
  sourcePath: "/workspace/project-alpha/.t3work/recipes/release-checklist/recipe.json",
  promptPath: "/workspace/project-alpha/.t3work/recipes/release-checklist/prompt.md",
  prompt: "Build a release checklist from the current backlog and open bugs.",
};

export const sprintRetroRecipe: ManagedProjectRecipe = {
  ...recipeBase,
  id: "sprint-retro",
  topic: "Team rituals",
  displayName: "Sprint retro notes",
  shortDescription: "Summarize the last sprint and capture follow-up actions.",
  active: true,
  recipePath: "/workspace/project-alpha/.t3work/recipes/sprint-retro",
  sourcePath: "/workspace/project-alpha/.t3work/recipes/sprint-retro/recipe.json",
  promptPath: "/workspace/project-alpha/.t3work/recipes/sprint-retro/prompt.md",
  prompt: "Draft a concise sprint retro with wins, misses, and next actions.",
};

export const bugTriageRecipe: ManagedProjectRecipe = {
  ...recipeBase,
  id: "bug-triage",
  topic: "Quality",
  displayName: "Bug triage sweep",
  shortDescription: "Review open bugs and propose priority changes.",
  active: false,
  recipePath: "/workspace/project-alpha/.t3work/recipes/bug-triage",
  sourcePath: "/workspace/project-alpha/.t3work/recipes/bug-triage/recipe.json",
  promptPath: "/workspace/project-alpha/.t3work/recipes/bug-triage/prompt.md",
  prompt: "Review open bugs, group duplicates, and recommend priority updates.",
};

export const onboardingRecipe: ManagedProjectRecipe = {
  ...recipeBase,
  id: "onboarding-guide",
  topic: "Team rituals",
  displayName: "Onboarding guide",
  shortDescription: "Generate a contributor onboarding guide for this repo.",
  active: true,
  deletable: false,
  recipePath: "/workspace/project-alpha/.t3work/recipes/onboarding-guide",
  sourcePath: "/workspace/project-alpha/.t3work/recipes/onboarding-guide/recipe.json",
  promptPath: "/workspace/project-alpha/.t3work/recipes/onboarding-guide/prompt.md",
  prompt: [
    "Create an onboarding guide covering:",
    "- local setup",
    "- test commands",
    "- release workflow",
    "- common debugging paths",
  ].join("\n"),
};

export const recipeManagerStoryRecipes = {
  single: [releaseChecklistRecipe],
  multiple: [releaseChecklistRecipe, sprintRetroRecipe, bugTriageRecipe, onboardingRecipe],
  deactivatedOnly: [{ ...releaseChecklistRecipe, active: false }],
} as const;
