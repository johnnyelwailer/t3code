import { useEffect, useState, type ComponentType } from "react";
import { evaluate } from "@mdx-js/mdx";
import { MDXProvider, useMDXComponents } from "@mdx-js/react";
import type { ProjectRecipeRenderContext } from "@t3tools/project-recipes";

import { cn } from "~/t3work/lib/t3work-utils";
import { RecipeLaunchControlsProvider } from "~/t3work/t3work-recipeActionLaunchControls";
import type { T3workRecipeQuickStartLaunchCustomization } from "~/t3work/t3work-recipeQuickStartLaunch";
import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipes";
import {
  DefaultRecipeQuickStartBody,
  recipeActionViewComponents,
} from "~/t3work/t3work-recipeActionViewComponents";
import * as jsxRuntime from "react/jsx-runtime";

type RecipeActionViewProps = {
  readonly ctx: ProjectRecipeRenderContext;
};

type RecipeActionViewComponent = ComponentType<RecipeActionViewProps>;

const actionViewComponentCache = new Map<string, Promise<RecipeActionViewComponent>>();

export async function compileT3workRecipeActionView(
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

export function T3workCompiledRecipeActionView({
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

export function T3workRecipeQuickStartBody({
  recipe,
  onCustomizationChange,
}: {
  recipe: T3workSidecarRecipeQuickStart;
  onCustomizationChange?: (
    customization: T3workRecipeQuickStartLaunchCustomization | undefined,
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
    void compileT3workRecipeActionView(actionViewSource)
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
        <T3workCompiledRecipeActionView
          Component={CompiledActionView}
          context={recipe.actionView.context}
        />
      </div>
    </RecipeLaunchControlsProvider>
  );
}
