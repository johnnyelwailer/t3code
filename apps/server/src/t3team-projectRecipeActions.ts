/**
 * One recipe, several actions (Epic 16 §Plugin Modules + §Recipe Sources And Precedence — "a
 * higher-precedence recipe … may override … orchestration entrypoint").
 *
 * `defineRecipe` keeps `defaultAction` as the entry a plain launch uses and adds an optional
 * `actions: { <name>: defineWorkflow(...) }` map. This module is the ONE place that turns those
 * refs into absolute `.workflow.ts` paths, so discovery, the agent-facing list, the launch route,
 * script ownership and execution authorization can never disagree about what a recipe declares.
 *
 * Security shape: the declared set is exactly `defaultAction` plus the named actions, each resolved
 * with `resolveWithinRoot` against the recipe directory. Adding actions therefore adds named
 * entries to an allow-list; it never turns the recipe directory into an execute-anything root
 * ({@link ./t3team-workflowRunPackAuthorize.ts}).
 */

import type * as Path from "effect/Path";

import type { AnyActionRef, AnyRecipeRef, AnyWorkflowRef } from "@t3team/sdk";
import { isPromptRef } from "@t3team/sdk";

import { isRelativePath, resolveWithinRoot } from "./t3team-projectRecipeDiscoveryShared.ts";
import {
  resolvePromptActionSource,
  type ResolvedPromptSource,
} from "./t3team-projectRecipePromptAction.ts";

/** How the wire spells "no action name given" — reserved, never a real action name. */
export const DEFAULT_RECIPE_ACTION_NAME = "default";

export type ResolvedRecipeAction = {
  /** `"default"` for `defaultAction`, otherwise the `actions` key. */
  readonly name: string;
  /** Absolute `.workflow.ts` path. Absent for prompt actions, which declare no workflow. */
  readonly workflowPath?: string;
  /** Absolute prompt-file path. Present for a `definePrompt("./prompt.md")` action. */
  readonly promptPath?: string;
  /** Inline prompt text. Present for a `definePrompt({ text })` action. */
  readonly promptText?: string;
};

/**
 * Resolve ONE action's workflow to an absolute path inside the recipe directory. Recompute from
 * `recipePath` + the ref's original relative `path` (rather than trusting the ref's stack-derived
 * `absolutePath`) so resolution is stable regardless of how the module was loaded; fall back to
 * `absolutePath` for absolute / `file://` author forms.
 */
function resolveWorkflowRefPath(
  pathService: Path.Path,
  recipePath: string,
  ref: AnyWorkflowRef,
): string {
  return isRelativePath(ref.path)
    ? resolveWithinRoot(pathService, recipePath, ref.path)
    : ref.absolutePath;
}

/** Resolve one action of either kind ({@link ./t3team-projectRecipePromptAction.ts}). */
function resolveActionRef(
  pathService: Path.Path,
  recipePath: string,
  name: string,
  ref: AnyActionRef,
): ResolvedRecipeAction {
  return isPromptRef(ref)
    ? { name, ...resolvePromptActionSource(pathService, recipePath, ref) }
    : { name, workflowPath: resolveWorkflowRefPath(pathService, recipePath, ref) };
}

/**
 * The recipe's `defaultAction` workflow path — what a plain launch runs. `undefined` when the
 * default action is a prompt: such a recipe launches a thread with prompt material instead of a
 * workflow run.
 */
export function resolveRecipeWorkflowPath(
  pathService: Path.Path,
  recipePath: string,
  ref: AnyRecipeRef,
): string | undefined {
  return isPromptRef(ref.defaultAction)
    ? undefined
    : resolveWorkflowRefPath(pathService, recipePath, ref.defaultAction);
}

/** The recipe's `defaultAction` prompt source, when the default action is a prompt. */
export function resolveRecipeDefaultPrompt(
  pathService: Path.Path,
  recipePath: string,
  ref: AnyRecipeRef,
): ResolvedPromptSource | undefined {
  return isPromptRef(ref.defaultAction)
    ? resolvePromptActionSource(pathService, recipePath, ref.defaultAction)
    : undefined;
}

/** Names of the recipe's named actions, in declaration order (excludes `defaultAction`). */
export function recipeActionNames(ref: AnyRecipeRef): ReadonlyArray<string> {
  return Object.keys(ref.actions ?? {});
}

/**
 * Every action the recipe declares, `default` first. An action whose path cannot be resolved
 * (escaping `../`, empty) is DROPPED rather than throwing: one broken action must not remove the
 * rest of the recipe from the catalog — and a dropped action is simply not authorized to run.
 */
export function resolveRecipeActions(
  pathService: Path.Path,
  recipePath: string,
  ref: AnyRecipeRef,
): ReadonlyArray<ResolvedRecipeAction> {
  const resolved: ResolvedRecipeAction[] = [];
  for (const [name, action] of [
    [DEFAULT_RECIPE_ACTION_NAME, ref.defaultAction] as const,
    ...Object.entries(ref.actions ?? {}),
  ]) {
    try {
      resolved.push(resolveActionRef(pathService, recipePath, name, action));
    } catch {
      // Intentionally silent here; the caller surfaces load/discover issues for the default action.
    }
  }
  return resolved;
}

/** The named actions only, in the serializable shape discovery and the agent list carry. */
export function resolveRecipeNamedActions(
  pathService: Path.Path,
  recipePath: string,
  ref: AnyRecipeRef,
): ReadonlyArray<ResolvedRecipeAction> {
  return resolveRecipeActions(pathService, recipePath, ref).filter(
    (action) => action.name !== DEFAULT_RECIPE_ACTION_NAME,
  );
}

/**
 * Resolve a launch's action name to a workflow path. An absent/blank/`default` name means
 * `defaultAction`, exactly as before actions existed. An unknown name is an error naming the
 * available actions — never a silent fallback to `defaultAction`, which would run something the
 * caller did not ask for.
 */
export function resolveRecipeActionPath(input: {
  readonly pathService: Path.Path;
  readonly recipePath: string;
  readonly ref: AnyRecipeRef;
  readonly actionName?: string | undefined;
}): string {
  const requested = input.actionName?.trim() ?? "";
  const isDefault = requested.length === 0 || requested === DEFAULT_RECIPE_ACTION_NAME;
  const action = isDefault ? input.ref.defaultAction : input.ref.actions?.[requested];
  if (action === undefined) {
    const available = [DEFAULT_RECIPE_ACTION_NAME, ...recipeActionNames(input.ref)].join(", ");
    throw new Error(
      `Recipe '${input.ref.id}' has no action '${requested}'. Available actions: ${available}.`,
    );
  }
  // A prompt action has no workflow to run. Callers that need a runnable workflow must say so
  // rather than receive a path that does not exist.
  if (isPromptRef(action)) {
    throw new Error(
      `Recipe '${input.ref.id}' action '${isDefault ? DEFAULT_RECIPE_ACTION_NAME : requested}' is a prompt action, not a workflow; it has no workflow to run.`,
    );
  }
  return resolveWorkflowRefPath(input.pathService, input.recipePath, action);
}

/** Whether `workflowPath` is one of the recipe's declared action workflows (identity, not directory). */
export function isDeclaredRecipeWorkflow(input: {
  readonly pathService: Path.Path;
  readonly recipePath: string;
  readonly ref: AnyRecipeRef;
  readonly workflowPath: string;
}): boolean {
  return resolveRecipeActions(input.pathService, input.recipePath, input.ref).some(
    (action) => action.workflowPath === input.workflowPath,
  );
}
