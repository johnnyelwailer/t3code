/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
/**
 * Recipe-module discovery (Epic 16 §Plugin Modules): load a project-local `recipe.ts` — a typed
 * `defineRecipe(...)` plugin module — and map it onto the SAME {@link ProjectRecipeDiscovered}
 * shape the catalog/launcher already consumes for `recipe.json` recipes.
 *
 * This is the "import() a typed module" path the doc calls for, sitting alongside the legacy
 * "parse JSON + eval `{{ }}` strings" path in {@link ./t3team-projectRecipeDiscoveryRecipe.ts}.
 * The recipe's `defaultAction` is a typed `WorkflowRef`; its resolved `.workflow.ts` becomes the
 * discovery result's `workflowPath`, which the existing engine launch path
 * ({@link ./t3team-workflowEngineLaunch.ts} `launchWorkflowRecipe`) runs unchanged.
 *
 * Module loading mirrors `visible.ts` evaluation ({@link ./t3team-projectRecipeDiscoveryVisibility.ts}):
 * a `pathToFileURL` import with a millisecond cache-buster so an edited recipe re-imports fresh.
 */

import * as Clock from "effect/Clock";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as NodeURL from "node:url";

import { queryableToReadonlyArray } from "@t3tools/project-context";
import {
  buildRecipeMatchSignalsFromRenderContext,
  matchRecipes,
  type ProjectRecipeDiscovered,
  type ProjectRecipeRenderContext,
  type Recipe,
  type RecipeApplicability,
  type RecipeMatchInput,
  type RecipeSurface,
} from "@t3tools/project-recipes";
import type { AnyRecipeRef } from "@t3team/sdk";

import {
  resolveRecipeDefaultPrompt,
  resolveRecipeNamedActions,
  resolveRecipeWorkflowPath,
} from "./t3team-projectRecipeActions.ts";
import { ensureProjectRecipeModuleResolution } from "./t3team-projectRecipeModuleResolution.ts";
import {
  renderRecipeMetadata,
  type RenderedRecipeMetadata,
} from "./t3team-projectRecipeMetadata.ts";
import {
  originFields,
  PROJECT_LOCAL_ORIGIN,
  type ProjectRecipeOrigin,
} from "./t3team-projectRecipeOrigin.ts";

/** A `recipe.ts` module loaded fine but did not default-export a `defineRecipe(...)` result. */
export class T3TeamRecipeModuleShapeError extends Data.TaggedError("T3TeamRecipeModuleShapeError")<{
  readonly message: string;
}> {}

/**
 * Project the SDK `RecipeRef`'s discovery metadata onto a project-recipes `Recipe` so the locked
 * {@link matchRecipes} applicability/scoring engine — the same one bundled recipes use — decides
 * visibility and rank. Keeps recipe.ts and recipe.json recipes ranked on one ruleset.
 */
function toRecipe(ref: AnyRecipeRef, metadata: RenderedRecipeMetadata): Recipe {
  return {
    id: ref.id,
    title: metadata.title,
    shortDescription: metadata.shortDescription,
    surfaces: ref.surfaces as ReadonlyArray<RecipeSurface>,
    appliesTo: (ref.appliesTo ?? {}) as RecipeApplicability,
    requiredContext: [],
    outputPreference: "markdown",
    ...(metadata.icon !== undefined ? { icon: metadata.icon } : {}),
    ...(ref.slashAlias !== undefined ? { slashAlias: ref.slashAlias } : {}),
    ...(metadata.rank !== undefined ? { rankHint: metadata.rank } : {}),
  };
}

/** Build a {@link RecipeMatchInput} from the render context (mirrors the bundled-compat matcher). */
function buildMatchInput(context: ProjectRecipeRenderContext): RecipeMatchInput {
  const provider = context.project.provider;
  const linkedProviders = queryableToReadonlyArray(context.linkedResources)
    .map((resource) => resource.provider)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  return {
    activeProject: provider ? { source: { provider } } : {},
    selectedResource: null,
    resourceKind: context.workitem?.kind ?? null,
    availableIntegrations: [...new Set([...(provider ? [provider] : []), ...linkedProviders])],
    surface: context.surface,
    ...(context.workitem?.type ? { jiraIssueType: context.workitem.type } : {}),
    enabledSkillPacks: context.enabledSkillPacks,
    profile: context.profile,
    availableContextKeys: queryableToReadonlyArray(context.availableContextKeys),
    signals: buildRecipeMatchSignalsFromRenderContext(context),
  };
}

/** Re-exported so existing callers keep one import site for "the recipe's default workflow". */
export { resolveRecipeWorkflowPath };

/**
 * Import a project-local `recipe.ts` module (cache-busted so edits re-import fresh) and return its
 * default-exported `defineRecipe(...)` ref. Shared between UI discovery and the agent-facing
 * recipe tools so both load typed recipes through one path.
 */
export const importRecipeModuleRef = Effect.fn("importRecipeModuleRef")(function* (
  modulePath: string,
) {
  // Project-local modules import `@t3team/sdk`; without this they fail with ERR_MODULE_NOT_FOUND
  // in any workspace that is not itself under an install.
  ensureProjectRecipeModuleResolution();
  const moduleUrl = NodeURL.pathToFileURL(modulePath);
  moduleUrl.searchParams.set("v", String(yield* Clock.currentTimeMillis));
  const imported = (yield* Effect.tryPromise(() => import(moduleUrl.toString()))) as {
    readonly default?: AnyRecipeRef;
  };

  const ref = imported.default;
  if (!ref || ref.kind !== "recipe") {
    return yield* Effect.fail(
      new T3TeamRecipeModuleShapeError({
        message: `recipe.ts must default-export a defineRecipe(...) result: ${modulePath}`,
      }),
    );
  }
  return ref;
});

export const discoverProjectRecipeModuleAtPath = Effect.fn("discoverProjectRecipeModuleAtPath")(
  function* (input: {
    readonly workspaceRoot: string;
    readonly recipePath: string;
    /** Absolute path to the recipe's `recipe.ts`. */
    readonly modulePath: string;
    readonly context: ProjectRecipeRenderContext;
    /** Defaults to project-local; pack discovery passes its own pack-scoped origin. */
    readonly origin?: ProjectRecipeOrigin;
  }) {
    const pathService = yield* Path.Path;

    const ref = yield* importRecipeModuleRef(input.modulePath);
    if (!ref.surfaces.includes(input.context.surface)) {
      return Option.none<ProjectRecipeDiscovered>();
    }

    // ctx-derived metadata + `visible` (Epic 16 §Plugin Modules). A deriver that throws hides only
    // this recipe; `visible` is ANDed with the declarative gates below, so it can only narrow.
    const rendered = renderRecipeMetadata(ref, input.context);
    if (rendered.kind !== "rendered") {
      return Option.none<ProjectRecipeDiscovered>();
    }
    const metadata = rendered.metadata;

    const match = matchRecipes([toRecipe(ref, metadata)], buildMatchInput(input.context))[0];
    if (!match) {
      return Option.none<ProjectRecipeDiscovered>();
    }

    const workflowPath = resolveRecipeWorkflowPath(pathService, input.recipePath, ref);
    const actions = resolveRecipeNamedActions(pathService, input.recipePath, ref);

    // A prompt default action (`definePrompt`) supplies the launcher's prompt material through the
    // same `prompt`/`promptPath` fields the retired recipe.json form used, so no launcher has to
    // learn a new shape. A prompt file that cannot be read degrades to empty prompt material
    // rather than removing the recipe from the catalog.
    const defaultPrompt = resolveRecipeDefaultPrompt(pathService, input.recipePath, ref);
    const promptText = defaultPrompt?.promptPath
      ? yield* (yield* FileSystem.FileSystem)
          .readFileString(defaultPrompt.promptPath)
          .pipe(Effect.orElseSucceed(() => ""))
      : (defaultPrompt?.promptText ?? "");

    return Option.some({
      id: ref.id,
      version: ref.version,
      ...originFields(input.origin ?? PROJECT_LOCAL_ORIGIN),
      displayName: metadata.title,
      shortDescription: metadata.shortDescription,
      ...(metadata.icon ? { icon: metadata.icon } : {}),
      ...(ref.slashAlias ? { slashAlias: ref.slashAlias } : {}),
      surfaces: ref.surfaces as ReadonlyArray<RecipeSurface>,
      rank: match.score,
      ...(match.reason ? { reason: match.reason } : {}),
      // Workflow-first recipes keep their prompt material in the `.workflow.ts` body (each `agent`
      // call), so these stay empty; a `definePrompt` default action fills them.
      prompt: promptText,
      promptPath: defaultPrompt?.promptPath ?? "",
      sourcePath: input.modulePath,
      recipePath: input.recipePath,
      ...(workflowPath ? { workflowPath } : {}),
      ...(actions.length === 0 ? {} : { actions }),
      allowedToolGroups: ref.allowedToolGroups ?? [],
      ...(ref.scripts === undefined ? {} : { scriptNames: Object.keys(ref.scripts) }),
    } satisfies ProjectRecipeDiscovered);
  },
);
