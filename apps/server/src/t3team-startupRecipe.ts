/**
 * A recipe the server starts by itself, on the thread it bootstraps for its working directory.
 *
 * `T3CODE_STARTUP_RECIPE=<recipe id>` names a pack recipe. When the server publishes its welcome
 * with a bootstrap thread, the recipe's workflow is launched there, with that thread's own model,
 * runtime and interaction modes, and `{ projectId }` as its arguments. A host that starts a
 * server for one job (a machine-setup cloud session) uses this so the job begins without a client
 * attached; the user finds it running.
 *
 * Not launched when the thread already has a live run: a resumed session continues that run
 * instead of starting a second one.
 *
 * @module t3team-startupRecipe
 */
import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";

import { WorkflowRunRepository } from "./persistence/WorkflowRuns.ts";
import * as ServerLifecycleEvents from "./serverLifecycleEvents.ts";
import { getPackRecipeSources, type PackRecipeSource } from "./t3team-packRecipeSources.ts";
import { launchRecipeWorkflow } from "./t3team-recipeWorkflowLaunch.ts";
import { loadThreadProjectContext } from "./t3team-thread-recipe-workflow-routes-shared.ts";

export const STARTUP_RECIPE_ENV = "T3CODE_STARTUP_RECIPE";

/** The pack recipe the env names, or why there is none to launch. */
export function resolveStartupRecipe(
  recipeId: string | undefined,
  sources: ReadonlyArray<PackRecipeSource>,
): { readonly kind: "none" } | { readonly kind: "missing"; readonly id: string } | PackRecipeSource {
  const id = recipeId?.trim() ?? "";
  if (id.length === 0) return { kind: "none" };
  return sources.find((source) => source.declaredId === id) ?? { kind: "missing", id };
}

export const launchStartupRecipe = Effect.fn("launchStartupRecipe")(function* (input: {
  readonly threadId: ThreadId;
  readonly recipe: PackRecipeSource;
}) {
  const runs = yield* WorkflowRunRepository;
  const live = yield* runs.listLiveByLaunchThread({ launchThreadId: input.threadId });
  if (live.length > 0) {
    yield* Effect.logInfo("startup recipe: the bootstrap thread already has a live run", {
      threadId: input.threadId,
      runIds: live.map((run) => run.runId),
    });
    return null;
  }
  const { thread } = yield* loadThreadProjectContext(input.threadId);
  const path = yield* Path.Path;
  return yield* launchRecipeWorkflow({
    threadId: input.threadId,
    recipePath: input.recipe.recipeRoot,
    workflowPath: path.join(input.recipe.recipeRoot, "workflow.ts"),
    // The project the recipe works on, for sources keyed by project (a change request's watch).
    args: { projectId: thread.projectId },
    modelSelection: thread.modelSelection,
    runtimeMode: thread.runtimeMode,
    interactionMode: thread.interactionMode,
  });
});

/** Waits for the first welcome that names a bootstrap thread, then launches the recipe once. */
export const T3TeamStartupRecipeLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const recipe = resolveStartupRecipe(
      process.env[STARTUP_RECIPE_ENV],
      getPackRecipeSources().sources,
    );
    if ("kind" in recipe) {
      if (recipe.kind === "missing") {
        yield* Effect.logWarning("startup recipe: no pack provides it", { recipeId: recipe.id });
      }
      return;
    }
    const lifecycle = yield* ServerLifecycleEvents.ServerLifecycleEvents;
    // The live stream, and the snapshot for a welcome published before this layer subscribed.
    const events = Stream.merge(
      lifecycle.stream,
      Stream.fromEffect(lifecycle.snapshot).pipe(
        Stream.flatMap((snapshot) => Stream.fromIterable(snapshot.events)),
      ),
    );
    const welcomed = Stream.runHead(
      events.pipe(
        Stream.map((event) =>
          event.type === "welcome" ? event.payload.bootstrapThreadId : undefined,
        ),
        Stream.filter((threadId): threadId is ThreadId => threadId !== undefined),
      ),
    );
    yield* welcomed.pipe(
      Effect.flatMap((threadId) =>
        Option.isNone(threadId)
          ? Effect.void
          : launchStartupRecipe({ threadId: threadId.value, recipe }).pipe(Effect.asVoid),
      ),
      Effect.catchCause((cause) =>
        Effect.logError("startup recipe: launch failed", { recipeId: recipe.declaredId, cause }),
      ),
      Effect.forkDetach({ startImmediately: true }),
    );
  }),
);
