import type { T3TeamActionRecipeContext } from "@t3tools/project-context";

/**
 * The reserved key a launch's context reaches the recipe's run under: `getArgs()["__launchContext"]`.
 * It sits beside `parameters`, never inside them, so a recipe that ignores it is unaffected;
 * {@link buildRecipeLaunchArgs} owns the key and drops a `parameters` entry that uses it.
 */
export const RECIPE_LAUNCH_CONTEXT_ARG = "__launchContext";

/** The run's `args`: the recipe's `parameters` plus the launch context under its reserved key. */
export function buildRecipeLaunchArgs(
  parameters: Readonly<Record<string, unknown>> | undefined,
  launchContext: T3TeamActionRecipeContext | undefined,
): Record<string, unknown> {
  const args: Record<string, unknown> = { ...parameters };
  delete args[RECIPE_LAUNCH_CONTEXT_ARG];
  if (launchContext !== undefined) {
    args[RECIPE_LAUNCH_CONTEXT_ARG] = launchContext;
  }
  return args;
}
