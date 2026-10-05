/**
 * Live wiring for the agent-facing `t3team.recipe.*` tools: resolves the calling thread's
 * project workspace root and runs the read-only list/validate implementations against it with
 * the broker's optional FileSystem/Path services. Kept out of {@link ./t3team-toolBrokerLive.ts}
 * so the broker file stays within the additive size budget.
 */
import type { ModelSelection, ServerProvider, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import type { ValidateRecipeToolResult } from "@t3team/sdk";

import { listProjectRecipesForAgent } from "./t3team-recipeAgentList.ts";
import { validateProjectRecipeWorkflowForAgent } from "./t3team-recipeAgentValidate.ts";
import type { T3TeamRecipeToolHandlers } from "./t3team-toolBrokerBindingRecipes.ts";
import { checkWorkflowSourceForValidate } from "./t3team-workflowSourceCheck.ts";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

type LoadThreadProject<E> = (threadId: ThreadId) => Effect.Effect<
  {
    readonly project: {
      readonly workspaceRoot: string | null | undefined;
      readonly defaultModelSelection?: ModelSelection | null | undefined;
    };
    readonly thread?: { readonly modelSelection?: ModelSelection | null | undefined } | undefined;
  },
  E
>;

export function makeRecipeToolHandlers<E>(deps: {
  readonly fileSystem?: FileSystem.FileSystem | undefined;
  readonly path?: Path.Path | undefined;
  readonly loadThreadProject: LoadThreadProject<E>;
  /** Live provider snapshots for the inline check's model gate; absent skips that gate. */
  readonly listProviders?: (() => Effect.Effect<ReadonlyArray<ServerProvider>>) | undefined;
}): (threadId: ThreadId) => T3TeamRecipeToolHandlers {
  const { fileSystem, path } = deps;

  const workspaceRoot = (threadId: ThreadId) =>
    deps.loadThreadProject(threadId).pipe(
      Effect.mapError(errorMessage),
      Effect.flatMap(({ project }) =>
        typeof project.workspaceRoot === "string" && project.workspaceRoot.length > 0
          ? Effect.succeed(project.workspaceRoot)
          : Effect.fail("Current t3team project has no workspace root."),
      ),
    );

  return (threadId) => {
    const validateRecipe = (args: {
      readonly path?: string;
      readonly source?: string;
    }): Effect.Effect<ValidateRecipeToolResult, string> => {
      if (typeof args.source === "string" && args.source.trim().length > 0) {
        // Inline source gets the FULL launch check (format, audit + types, live model slugs), so
        // the author's validate and the launch gate can never disagree.
        const source = args.source;
        return Effect.gen(function* () {
          const loaded = yield* deps.loadThreadProject(threadId).pipe(Effect.result);
          const baseModelSelection =
            loaded._tag === "Success"
              ? (loaded.success.thread?.modelSelection ??
                loaded.success.project.defaultModelSelection)
              : undefined;
          const providers =
            deps.listProviders === undefined || !baseModelSelection
              ? undefined
              : yield* deps.listProviders();
          return checkWorkflowSourceForValidate({
            source,
            providers,
            baseModelSelection: baseModelSelection ?? undefined,
          });
        });
      }
      if (!fileSystem || !path) {
        return Effect.fail(
          "Filesystem services are not available for t3team recipe tools in this runtime.",
        );
      }
      if (typeof args.path !== "string" || args.path.trim().length === 0) {
        return Effect.fail("t3team.recipe.validate requires a non-empty 'path' or 'source'.");
      }
      const requestedPath = args.path;
      return workspaceRoot(threadId).pipe(
        Effect.flatMap((root) =>
          validateProjectRecipeWorkflowForAgent({ workspaceRoot: root, path: requestedPath }).pipe(
            Effect.mapError(errorMessage),
            Effect.provideService(FileSystem.FileSystem, fileSystem),
            Effect.provideService(Path.Path, path),
          ),
        ),
      );
    };

    if (!fileSystem || !path) {
      const unavailable = Effect.fail(
        "Filesystem services are not available for t3team recipe tools in this runtime.",
      );
      return { listRecipes: () => unavailable, validateRecipe };
    }
    const provide = <A, E>(
      effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
    ): Effect.Effect<A, string> =>
      effect.pipe(
        Effect.mapError(errorMessage),
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provideService(Path.Path, path),
      );

    return {
      listRecipes: () =>
        workspaceRoot(threadId).pipe(
          Effect.flatMap((root) => provide(listProjectRecipesForAgent({ workspaceRoot: root }))),
        ),
      validateRecipe,
    };
  };
}
