import type {
  DeleteManagedProjectRecipeRequest,
  DeleteManagedProjectRecipeResponse,
  ListManagedProjectRecipesRequest,
  ListManagedProjectRecipesResponse,
  UpdateManagedProjectRecipeRequest,
  UpdateManagedProjectRecipeResponse,
} from "@t3tools/project-recipes";

/**
 * Read/write operations the recipe manager page needs on a project's saved
 * recipes. Split out of `ProjectWorkspaceBackendApi` (which composes slices the
 * same way it composes the Atlassian and GitHub APIs) to keep that file under
 * the prefixed-file LOC cap.
 */
export interface RecipeManagementBackendApi {
  readonly listManagedRecipes: (
    input: ListManagedProjectRecipesRequest,
  ) => Promise<ListManagedProjectRecipesResponse>;
  readonly updateManagedRecipe: (
    input: UpdateManagedProjectRecipeRequest,
  ) => Promise<UpdateManagedProjectRecipeResponse>;
  readonly deleteManagedRecipe: (
    input: DeleteManagedProjectRecipeRequest,
  ) => Promise<DeleteManagedProjectRecipeResponse>;
}
