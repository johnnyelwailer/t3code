import { useEffect, useState, type ComponentType } from "react";
import { evaluate } from "@mdx-js/mdx";
import { MDXProvider, useMDXComponents } from "@mdx-js/react";
import type { ProjectRecipeRenderContext } from "@t3tools/project-recipes";

import { BoundedMap } from "~/t3team/lib/t3team-boundedMap";
import { cn } from "~/t3team/lib/t3team-utils";
import { RecipeLaunchControlsProvider } from "~/t3team/t3team-recipeActionLaunchControls";
import type { T3TeamRecipeQuickStartLaunchCustomization } from "~/t3team/t3team-recipeQuickStartLaunch";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipes";
import {
  DefaultRecipeQuickStartBody,
  recipeActionViewComponents,
} from "~/t3team/t3team-recipeActionViewComponents";
import * as jsxRuntime from "react/jsx-runtime";

type RecipeActionViewProps = {
  readonly ctx: ProjectRecipeRenderContext;
};

type RecipeActionViewComponent = ComponentType<RecipeActionViewProps>;

const ACTION_VIEW_CACHE_MAX_ENTRIES = 20;
const actionViewComponentCache = new BoundedMap<string, Promise<RecipeActionViewComponent>>({
  maxEntries: ACTION_VIEW_CACHE_MAX_ENTRIES,
});

export async function compileT3TeamRecipeActionView(
  source: string,
): Promise<RecipeActionViewComponent> {
  const cached = actionViewComponentCache.get(source);
  if (cached) {
    return cached;
  }

  const pending = evaluate(source, {
    ...jsxRuntime,
    useMDXComponents,
  })
    .then((module) => {
      if (typeof module.default !== "function") {
        throw new Error("Action view did not export a renderable default component.");
      }

      return module.default as RecipeActionViewComponent;
    })
    .catch((error) => {
      actionViewComponentCache.delete(source);
      throw error;
    });

  actionViewComponentCache.set(source, pending);
  return pending;
}

export function T3TeamCompiledRecipeActionView({
  Component,
  context,
}: {
  Component: RecipeActionViewComponent;
  context: ProjectRecipeRenderContext;
}) {
  return (
    <MDXProvider components={recipeActionViewComponents}>
      <Component ctx={context} />
    </MDXProvider>
  );
}

export function T3TeamRecipeQuickStartBody({
  recipe,
  onCustomizationChange,
}: {
  recipe: T3TeamSidecarRecipeQuickStart;
  onCustomizationChange?: (
    customization: T3TeamRecipeQuickStartLaunchCustomization | undefined,
  ) => void;
}) {
  const [CompiledActionView, setCompiledActionView] = useState<RecipeActionViewComponent | null>(
    null,
  );
  const [hasLoadError, setHasLoadError] = useState(false);
  const actionViewSource = recipe.actionView?.source;

  useEffect(() => {
    if (!actionViewSource) {
      setCompiledActionView(null);
      setHasLoadError(false);
      return;
    }

    let cancelled = false;
    setCompiledActionView(null);
    setHasLoadError(false);
    void compileT3TeamRecipeActionView(actionViewSource)
      .then((component) => {
        if (!cancelled) {
          setCompiledActionView(() => component);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasLoadError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [actionViewSource]);

  if (!recipe.actionView || hasLoadError || !CompiledActionView) {
    return <DefaultRecipeQuickStartBody recipe={recipe} />;
  }

  return (
    <RecipeLaunchControlsProvider
      {...(onCustomizationChange ? { onChange: onCustomizationChange } : {})}
    >
      <div className={cn("space-y-2", hasLoadError ? "opacity-90" : undefined)}>
        <T3TeamCompiledRecipeActionView
          Component={CompiledActionView}
          context={recipe.actionView.context}
        />
      </div>
    </RecipeLaunchControlsProvider>
  );
}
