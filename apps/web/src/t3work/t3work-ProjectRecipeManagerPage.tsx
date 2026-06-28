import type { ManagedProjectRecipe } from "@t3tools/project-recipes";
import type { ProjectShellProject } from "@t3tools/project-context";
import { useMemo } from "react";
import { ScrollArea } from "~/t3work/components/ui/t3work-scroll-area";
import { ProjectRecipeManagerEditor } from "~/t3work/t3work-ProjectRecipeManagerEditor";
import { ProjectRecipeManagerPageHeader } from "~/t3work/t3work-ProjectRecipeManagerPageHeader";
import { RecipeManagerRecipeList } from "~/t3work/t3work-RecipeManagerRecipeList";
import { groupManagedProjectRecipesByTopic } from "~/t3work/t3work-recipeManagerModel";
import { useProjectRecipeManager } from "~/t3work/t3work-useProjectRecipeManager";

export type ProjectRecipeManagerPageProps = {
  readonly project: ProjectShellProject;
  readonly shouldInsetDesktopHeader?: boolean;
  readonly onBack: () => void;
  readonly onEditRecipeWithChat: (recipe: ManagedProjectRecipe) => void;
};

export function ProjectRecipeManagerPage({
  project,
  shouldInsetDesktopHeader = false,
  onBack,
  onEditRecipeWithChat,
}: ProjectRecipeManagerPageProps) {
  const manager = useProjectRecipeManager(project);
  const workspaceRoot = project.workspace?.rootPath;
  const recipeGroups = useMemo(
    () => groupManagedProjectRecipesByTopic(manager.sortedRecipes),
    [manager.sortedRecipes],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <ProjectRecipeManagerPageHeader
        project={project}
        shouldInsetDesktopHeader={shouldInsetDesktopHeader}
        onBack={onBack}
      />
      {!workspaceRoot ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">This project has no workspace yet.</p>
      ) : manager.sortedRecipes.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No project-local recipes found.</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)] overflow-hidden">
          <aside className="flex min-h-0 flex-col border-r border-border">
            <div className="shrink-0 border-b border-border px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recipes
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {manager.sortedRecipes.length} project-local
              </p>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <RecipeManagerRecipeList
                groups={recipeGroups}
                selectedRecipePath={manager.selected?.recipePath ?? null}
                onSelectRecipe={manager.selectRecipe}
              />
            </ScrollArea>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <ProjectRecipeManagerEditor
              recipe={manager.selected}
              draft={manager.draft}
              busy={manager.busyPath !== null}
              onDraftChange={manager.setDraft}
              onSave={() => void manager.saveSelected()}
              onEditWithChat={() => {
                if (manager.selected) onEditRecipeWithChat(manager.selected);
              }}
              onToggleActive={() => {
                if (manager.selected) void manager.toggleRecipe(manager.selected);
              }}
              onDelete={() => {
                if (manager.selected) void manager.deleteRecipe(manager.selected);
              }}
            />
          </section>
        </div>
      )}
      {manager.error ? (
        <p className="shrink-0 border-t border-border px-4 py-2 text-sm text-destructive">
          {manager.error}
        </p>
      ) : null}
    </div>
  );
}
