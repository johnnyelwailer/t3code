import type { Meta, StoryObj } from "@storybook/react";
import type { ManagedProjectRecipe } from "@t3tools/project-recipes";

import { BackendProvider, createMockBackend, type BackendApi } from "~/t3work/backend/t3work-index";
import { ProjectRecipeManagerPage } from "~/t3work/t3work-ProjectRecipeManagerPage";
import { ResizableRightSidebarLayout } from "~/t3work/t3work-ResizableRightSidebarLayout";
import {
  recipeManagerStoryProject,
  recipeManagerStoryRecipes,
} from "~/t3work/stories/t3work-recipeManagerFixtures";

function createRecipeManagerBackend(recipes: ReadonlyArray<ManagedProjectRecipe>): BackendApi {
  const backend = createMockBackend();
  return {
    ...backend,
    projectWorkspace: {
      ...backend.projectWorkspace,
      listManagedRecipes: async () => ({
        workspaceRoot: recipeManagerStoryProject.workspace!.rootPath,
        hasProjectLocalRecipes: recipes.length > 0,
        recipes,
      }),
      updateManagedRecipe: async (_input) => ({
        workspaceRoot: recipeManagerStoryProject.workspace!.rootPath,
        recipe: recipes[0]!,
      }),
      deleteManagedRecipe: async (input) => ({
        workspaceRoot: recipeManagerStoryProject.workspace!.rootPath,
        deletedRecipePath: input.recipePath,
      }),
    },
  };
}

function ProjectRecipeManagerPageStory({
  recipes,
  withSidecar = false,
}: {
  readonly recipes: ReadonlyArray<ManagedProjectRecipe>;
  readonly withSidecar?: boolean;
}) {
  const page = (
    <ProjectRecipeManagerPage
      project={recipeManagerStoryProject}
      onBack={() => {}}
      onEditRecipeWithChat={() => {}}
    />
  );

  return (
    <BackendProvider backend={createRecipeManagerBackend(recipes)}>
      <div className="flex h-screen bg-background text-foreground">
        {withSidecar ? (
          <ResizableRightSidebarLayout
            storageKey="t3work_storybook_recipe_manager_sidebar"
            collapsedStorageKey="t3work_storybook_recipe_manager_sidebar_collapsed"
            minAsideWidth={22 * 16}
            defaultAsideWidth={24 * 16}
            mobileMainLabel="Recipes"
            mobileAsideLabel="Chat"
            main={page}
            aside={
              <div className="flex h-full flex-col border-l border-border bg-muted/20">
                <header className="border-b border-border px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Sidecar chat
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Edit with chat attaches recipe context here in the live app.
                  </p>
                </header>
                <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
                  Mock kickoff aside
                </div>
              </div>
            }
          />
        ) : (
          page
        )}
      </div>
    </BackendProvider>
  );
}

const meta = {
  title: "T3work/Recipes/Manager Page",
  component: ProjectRecipeManagerPageStory,
  parameters: {
    layout: "fullscreen",
    viewport: { defaultViewport: "desktop" },
  },
} satisfies Meta<typeof ProjectRecipeManagerPageStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleRecipe: Story = {
  args: { recipes: recipeManagerStoryRecipes.single },
};

export const MultipleRecipes: Story = {
  args: { recipes: recipeManagerStoryRecipes.multiple },
};

export const DeactivatedSelected: Story = {
  args: { recipes: recipeManagerStoryRecipes.deactivatedOnly },
};

export const Empty: Story = {
  args: { recipes: [] },
};

export const WithSidecarLayout: Story = {
  args: {
    recipes: recipeManagerStoryRecipes.multiple,
    withSidecar: true,
  },
};
