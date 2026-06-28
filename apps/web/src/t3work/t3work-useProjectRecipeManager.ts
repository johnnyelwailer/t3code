import { useEffect, useMemo, useState } from "react";
import type { ManagedProjectRecipe } from "@t3tools/project-recipes";
import type { ProjectShellProject } from "@t3tools/project-context";

import { readLocalApi } from "~/localApi";
import { useBackend } from "~/t3work/backend/t3work-index";
import {
  ProjectRecipeManagerEditor,
  type ProjectRecipeManagerDraft,
  toProjectRecipeManagerDraft,
} from "~/t3work/t3work-ProjectRecipeManagerEditor";
import { sortManagedProjectRecipes } from "~/t3work/t3work-recipeManagerModel";

export type ProjectRecipeManagerEditorProps = Parameters<typeof ProjectRecipeManagerEditor>[0];

export type ProjectRecipeManagerState = {
  readonly sortedRecipes: ReadonlyArray<ManagedProjectRecipe>;
  readonly selected: ManagedProjectRecipe | null;
  readonly draft: ProjectRecipeManagerDraft | null;
  readonly busyPath: string | null;
  readonly error: string | null;
  readonly selectRecipe: (recipe: ManagedProjectRecipe) => void;
  readonly setDraft: (draft: ProjectRecipeManagerDraft) => void;
  readonly saveSelected: () => Promise<void>;
  readonly deleteRecipe: (recipe: ManagedProjectRecipe) => Promise<void>;
  readonly toggleRecipe: (recipe: ManagedProjectRecipe) => Promise<void>;
};

export function useProjectRecipeManager(project: ProjectShellProject): ProjectRecipeManagerState {
  const backend = useBackend();
  const workspaceRoot = project.workspace?.rootPath;
  const [recipes, setRecipes] = useState<ReadonlyArray<ManagedProjectRecipe>>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProjectRecipeManagerDraft | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sortedRecipes = useMemo(() => sortManagedProjectRecipes(recipes), [recipes]);
  const selected = sortedRecipes.find((recipe) => recipe.recipePath === selectedPath) ?? null;

  const applyRecipes = (
    nextRecipes: ReadonlyArray<ManagedProjectRecipe>,
    preferredPath: string | null,
  ) => {
    const nextSelected =
      nextRecipes.find((recipe) => recipe.recipePath === preferredPath) ?? nextRecipes[0] ?? null;
    setRecipes(nextRecipes);
    setSelectedPath(nextSelected?.recipePath ?? null);
    setDraft(nextSelected ? toProjectRecipeManagerDraft(nextSelected) : null);
  };

  const loadRecipes = async (preferredPath = selectedPath) => {
    if (!backend || !workspaceRoot) return;
    const response = await backend.projectWorkspace.listManagedRecipes({
      workspaceRoot,
    });
    applyRecipes(response.recipes, preferredPath);
  };

  useEffect(() => {
    setError(null);
    void loadRecipes().catch((cause) =>
      setError(cause instanceof Error ? cause.message : "Failed to load project recipes."),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, workspaceRoot]);

  const mutateRecipe = async (recipe: ManagedProjectRecipe, mutation: () => Promise<void>) => {
    setBusyPath(recipe.recipePath);
    setError(null);
    try {
      await mutation();
      await loadRecipes(recipe.recipePath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to update project recipe.");
    } finally {
      setBusyPath(null);
    }
  };

  const selectRecipe = (recipe: ManagedProjectRecipe) => {
    setSelectedPath(recipe.recipePath);
    setDraft(toProjectRecipeManagerDraft(recipe));
  };

  const saveSelected = async () => {
    if (!backend || !workspaceRoot || !selected || !draft) return;
    await mutateRecipe(selected, async () => {
      await backend.projectWorkspace.updateManagedRecipe({
        workspaceRoot,
        recipePath: selected.recipePath,
        displayName: draft.displayName,
        shortDescription: draft.shortDescription,
        ...(draft.prompt !== undefined ? { prompt: draft.prompt } : {}),
      });
    });
  };

  const deleteRecipe = async (recipe: ManagedProjectRecipe) => {
    if (!recipe.deletable) return;
    const api = readLocalApi();
    const confirmed = api
      ? await api.dialogs.confirm(`Delete recipe "${recipe.displayName}"?`)
      : window.confirm(`Delete recipe "${recipe.displayName}"?`);
    if (!confirmed || !backend || !workspaceRoot) return;
    await mutateRecipe(recipe, async () => {
      await backend.projectWorkspace.deleteManagedRecipe({
        workspaceRoot,
        recipePath: recipe.recipePath,
      });
    });
  };

  const toggleRecipe = async (recipe: ManagedProjectRecipe) => {
    if (!backend || !workspaceRoot) return;
    await mutateRecipe(recipe, async () => {
      await backend.projectWorkspace.updateManagedRecipe({
        workspaceRoot,
        recipePath: recipe.recipePath,
        active: !recipe.active,
      });
    });
  };

  return {
    sortedRecipes,
    selected,
    draft,
    busyPath,
    error,
    selectRecipe,
    setDraft,
    saveSelected,
    deleteRecipe,
    toggleRecipe,
  };
}
