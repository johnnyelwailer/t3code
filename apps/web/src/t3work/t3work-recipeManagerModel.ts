import type { ManagedProjectRecipe } from "@t3tools/project-recipes";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { AddToChatRequest } from "~/t3work/t3work-addToChatUtils";

export const RECIPE_MANAGER_DEFAULT_TOPIC = "General";

export type ManagedProjectRecipeGroup = {
  readonly topic: string;
  readonly recipes: ReadonlyArray<ManagedProjectRecipe>;
};

export function resolveManagedProjectRecipeTopic(recipe: ManagedProjectRecipe): string {
  const topic = recipe.topic?.trim();
  return topic && topic.length > 0 ? topic : RECIPE_MANAGER_DEFAULT_TOPIC;
}

export function sortManagedProjectRecipes(
  recipes: ReadonlyArray<ManagedProjectRecipe>,
): ReadonlyArray<ManagedProjectRecipe> {
  return [...recipes].sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    if (left.editable !== right.editable) return left.editable ? -1 : 1;
    return left.displayName.localeCompare(right.displayName);
  });
}

export function groupManagedProjectRecipesByTopic(
  recipes: ReadonlyArray<ManagedProjectRecipe>,
): ReadonlyArray<ManagedProjectRecipeGroup> {
  const groups = new Map<string, ManagedProjectRecipe[]>();
  for (const recipe of sortManagedProjectRecipes(recipes)) {
    const topic = resolveManagedProjectRecipeTopic(recipe);
    const bucket = groups.get(topic) ?? [];
    bucket.push(recipe);
    groups.set(topic, bucket);
  }

  return [...groups.entries()]
    .sort(([leftTopic], [rightTopic]) => {
      if (leftTopic === RECIPE_MANAGER_DEFAULT_TOPIC) return 1;
      if (rightTopic === RECIPE_MANAGER_DEFAULT_TOPIC) return -1;
      return leftTopic.localeCompare(rightTopic);
    })
    .map(([topic, groupedRecipes]) => ({ topic, recipes: groupedRecipes }));
}

export function buildRecipeManagerChatRequest(input: {
  readonly project: ProjectShellProject;
  readonly recipe: ManagedProjectRecipe;
}): AddToChatRequest {
  const { project, recipe } = input;
  return {
    projectId: project.id,
    projectTitle: project.title,
    ...(project.workspace?.rootPath ? { projectWorkspaceRoot: project.workspace.rootPath } : {}),
    targetLabel: recipe.displayName,
    targetType: "project-recipe",
    kind: "project-recipe",
    dedupeKey: `${project.id}:recipe:${recipe.recipePath}`,
    summaryItems: [
      { label: "Recipe", value: recipe.id },
      { label: "Source", value: recipe.sourceKind === "recipe-json" ? "recipe.json" : "recipe.ts" },
      { label: "State", value: recipe.active ? "Active" : "Deactivated" },
    ],
    payload: {
      kind: "project-recipe",
      id: recipe.id,
      version: recipe.version,
      title: recipe.displayName,
      description: recipe.shortDescription,
      active: recipe.active,
      editable: recipe.editable,
      recipePath: recipe.recipePath,
      sourcePath: recipe.sourcePath,
      promptPath: recipe.promptPath,
      workflowPath: recipe.workflowPath,
      surfaces: recipe.surfaces,
      prompt: recipe.prompt,
    },
  };
}
