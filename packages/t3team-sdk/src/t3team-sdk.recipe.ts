import { getRegistry } from "./t3team-sdk.internal.ts";
import type { PromptRef } from "./t3team-sdk.prompt.ts";
import type * as T from "./t3team-sdk.types.ts";

/** Action names are wire identifiers (`launch.actionName`), so keep them boring and stable. */
const ACTION_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** `default` is how the wire spells "no action name given" — it may not also be a real action. */
export const DEFAULT_RECIPE_ACTION_NAME = "default";

function assertActions(recipeId: string, actions: Readonly<Record<string, unknown>>): void {
  for (const [name, action] of Object.entries(actions)) {
    if (!ACTION_NAME_PATTERN.test(name)) {
      throw new Error(
        `Recipe '${recipeId}': action names must match ${String(ACTION_NAME_PATTERN)} (got '${name}').`,
      );
    }
    if (name === DEFAULT_RECIPE_ACTION_NAME) {
      throw new Error(
        `Recipe '${recipeId}': '${DEFAULT_RECIPE_ACTION_NAME}' is reserved for defaultAction; name the action something else.`,
      );
    }
    const kind =
      typeof action === "object" && action !== null
        ? (action as { kind?: unknown }).kind
        : undefined;
    if (kind !== "workflow" && kind !== "prompt") {
      throw new Error(
        `Recipe '${recipeId}': actions.${name} is not a defineWorkflow(...) or definePrompt(...) result. Each entry must be a WorkflowRef or a PromptRef.`,
      );
    }
  }
}

export function defineRecipe<RInputs, ROutputs>(opts: {
  readonly id: string;
  readonly version: string;
  readonly scope?: "project";
  /** Plain string, or Epic 16's `(ctx) => …` deriver. */
  readonly title: T.RecipeDerived<string>;
  readonly shortDescription: T.RecipeDerived<string>;
  readonly surfaces: ReadonlyArray<string>;
  readonly icon?: T.RecipeDerived<string>;
  readonly rank?: T.RecipeDerived<number>;
  readonly appliesTo?: T.RecipeApplicabilitySpec;
  /** Extra visibility gate, evaluated together with `appliesTo` (narrowing only). */
  readonly visible?: T.RecipeVisiblePredicate;
  /**
   * Context keys this recipe needs in order to be shown. Declaring a key is how a recipe gets data
   * without fetching it: the host supplies what it can, and the matcher hides the recipe when a
   * non-optional key is absent. Cheap by construction — a set test per recipe, no I/O.
   */
  readonly requiredContext?: ReadonlyArray<T.RecipeContextRequirementSpec>;
  readonly allowedToolGroups?: ReadonlyArray<string>;
  readonly slashAlias?: string;
  /** Recipe-private scripts (Epic 25 §Scripts): `scripts: { fetchPr }` makes `scripts.fetchPr`
   * available inside this recipe's workflows (bodies must declare the `"script"` capability). */
  readonly scripts?: Readonly<Record<string, T.AnyScriptRef>>;
  /**
   * The plain-launch entry. `defineWorkflow(...)` is the structured form and the default
   * choice; `definePrompt(...)` is for recipes whose whole action is a prompt.
   */
  readonly defaultAction: T.WorkflowRef<RInputs, ROutputs> | PromptRef;
  /** Named sibling actions of the same recipe; `defaultAction` stays the plain-launch entry. */
  readonly actions?: Readonly<Record<string, T.AnyActionRef>>;
  readonly defaults?: Partial<RInputs>;
}): T.RecipeRef<RInputs, ROutputs> {
  if (opts.scope !== undefined && opts.scope !== "project") {
    throw new Error(`Recipe '${opts.id}': only project-scoped recipes are supported.`);
  }
  if (opts.id.trim().length === 0) {
    throw new Error("Recipe must include a non-empty id.");
  }
  if (opts.version.trim().length === 0) {
    throw new Error(`Recipe '${opts.id}' must include a non-empty version.`);
  }
  for (const requirement of opts.requiredContext ?? []) {
    if (requirement.key.trim().length === 0) {
      throw new Error(`Recipe '${opts.id}': requiredContext keys must be non-empty.`);
    }
  }
  for (const [name, script] of Object.entries(opts.scripts ?? {})) {
    if (name.trim().length === 0) {
      throw new Error(`Recipe '${opts.id}': script names must be non-empty.`);
    }
    if (typeof script !== "function" || script.kind !== "script") {
      throw new Error(
        `Recipe '${opts.id}': scripts.${name} is not a defineScript(...) result. Each entry must be a ScriptRef (e.g. \`export default defineScript({...})\` in scripts/${name}.ts).`,
      );
    }
  }
  assertActions(opts.id, opts.actions ?? {});

  const ref = Object.freeze({
    kind: "recipe" as const,
    id: opts.id,
    version: opts.version,
    scope: "project" as const,
    title: opts.title,
    shortDescription: opts.shortDescription,
    surfaces: opts.surfaces,
    ...(opts.icon === undefined ? {} : { icon: opts.icon }),
    ...(opts.rank === undefined ? {} : { rank: opts.rank }),
    ...(opts.appliesTo === undefined ? {} : { appliesTo: opts.appliesTo }),
    ...(opts.visible === undefined ? {} : { visible: opts.visible }),
    ...(opts.requiredContext === undefined
      ? {}
      : { requiredContext: Object.freeze([...opts.requiredContext]) }),
    ...(opts.allowedToolGroups === undefined ? {} : { allowedToolGroups: opts.allowedToolGroups }),
    ...(opts.slashAlias === undefined ? {} : { slashAlias: opts.slashAlias }),
    ...(opts.scripts === undefined ? {} : { scripts: Object.freeze({ ...opts.scripts }) }),
    defaultAction: opts.defaultAction,
    ...(opts.actions === undefined ? {} : { actions: Object.freeze({ ...opts.actions }) }),
    ...(opts.defaults === undefined ? {} : { defaults: opts.defaults }),
  }) as T.RecipeRef<RInputs, ROutputs>;

  getRegistry().recipes.set(opts.id, ref as T.AnyRecipeRef);
  return ref;
}

export function getRegisteredRecipe(recipeId: string): T.AnyRecipeRef | undefined {
  return getRegistry().recipes.get(recipeId);
}

export function listRegisteredRecipes(): ReadonlyArray<T.AnyRecipeRef> {
  return Object.freeze(Array.from(getRegistry().recipes.values()));
}
