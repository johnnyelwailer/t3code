/**
 * A recipe the server starts on the first message the user sends on its bootstrap thread.
 *
 * `T3CODE_KICKOFF_RECIPE=<recipe id>` names a pack recipe. Once the server's welcome names a
 * bootstrap thread, the first message the user types there launches the recipe's workflow on that
 * thread, with the thread's own model and modes and `{ firstMessage }` as its argument.
 * The recipe decides from the message whether it has work to do; the user's own turn never waits
 * on it, and its agent steps run in child threads. A host that starts a server for one project (a
 * cloud session of a project with no machine) uses this to set the machine up only when the task
 * needs it.
 *
 * Reads the live event tail only: history is not a first message. Not launched when the thread
 * already has a live run, so a resumed session continues that run instead of starting another.
 *
 * @module t3team-kickoffRecipe
 */
import type { OrchestrationV2StoredEvent, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";

import { EventSinkV2 } from "./orchestration-v2/EventSink.ts";
import { WorkflowRunRepository } from "./persistence/WorkflowRuns.ts";
import * as ServerLifecycleEvents from "./serverLifecycleEvents.ts";
import { getPackRecipeSources, type PackRecipeSource } from "./t3team-packRecipeSources.ts";
import { launchRecipeWorkflow } from "./t3team-recipeWorkflowLaunch.ts";
import { loadThreadProjectContext } from "./t3team-thread-recipe-workflow-routes-shared.ts";
import { T3TeamEventSinkLayer } from "./t3team-v2/t3team-v2Layers.ts";

export const KICKOFF_RECIPE_ENV = "T3CODE_KICKOFF_RECIPE";

/** The pack recipe the env names, or why there is none to launch. */
export function resolveKickoffRecipe(
  recipeId: string | undefined,
  sources: ReadonlyArray<PackRecipeSource>,
): { readonly kind: "none" } | { readonly kind: "missing"; readonly id: string } | PackRecipeSource {
  const id = recipeId?.trim() ?? "";
  if (id.length === 0) return { kind: "none" };
  return sources.find((source) => source.declaredId === id) ?? { kind: "missing", id };
}

export const launchKickoffRecipe = Effect.fn("launchKickoffRecipe")(function* (input: {
  readonly threadId: ThreadId;
  readonly recipe: PackRecipeSource;
  readonly firstMessage: string;
}) {
  const runs = yield* WorkflowRunRepository;
  const live = yield* runs.listLiveByLaunchThread({ launchThreadId: input.threadId });
  if (live.length > 0) {
    yield* Effect.logInfo("kickoff recipe: the thread already has a live run", {
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
    args: { firstMessage: input.firstMessage },
    modelSelection: thread.modelSelection,
    runtimeMode: thread.runtimeMode,
    interactionMode: thread.interactionMode,
  });
});

/** The text of a message the user typed on `threadId`; undefined for anything else. */
export function userMessageText(
  { event }: Pick<OrchestrationV2StoredEvent, "event">,
  threadId: ThreadId,
): string | undefined {
  return event.type === "message.updated" &&
    event.threadId === threadId &&
    event.payload.role === "user" &&
    event.payload.createdBy === "user"
    ? event.payload.text
    : undefined;
}

/** The first bootstrap thread a welcome names; the snapshot covers a welcome published earlier. */
const bootstrapThread = Effect.gen(function* () {
  const lifecycle = yield* ServerLifecycleEvents.ServerLifecycleEvents;
  const events = Stream.merge(
    lifecycle.stream,
    Stream.fromEffect(lifecycle.snapshot).pipe(
      Stream.flatMap((snapshot) => Stream.fromIterable(snapshot.events)),
    ),
  );
  return yield* Stream.runHead(
    events.pipe(
      Stream.map((event) =>
        event.type === "welcome" ? event.payload.bootstrapThreadId : undefined,
      ),
      Stream.filter((threadId): threadId is ThreadId => threadId !== undefined),
    ),
  );
});

/** Arms on the welcome, launches on the first typed user message on that thread. */
export const T3TeamKickoffRecipe = Layer.effectDiscard(
  Effect.gen(function* () {
    const recipe = resolveKickoffRecipe(
      process.env[KICKOFF_RECIPE_ENV],
      getPackRecipeSources().sources,
    );
    if ("kind" in recipe) {
      if (recipe.kind === "missing") {
        yield* Effect.logWarning("kickoff recipe: no pack provides it", { recipeId: recipe.id });
      }
      return;
    }
    const eventSink = yield* EventSinkV2;
    // Fixed when the layer builds, so a message committed before the stream subscribes still counts.
    const bootSequence = yield* eventSink.latestSequence().pipe(Effect.orDie);
    yield* Effect.gen(function* () {
      const threadId = yield* bootstrapThread;
      if (Option.isNone(threadId)) return;
      const first = yield* Stream.runHead(
        eventSink.stream({ afterSequence: bootSequence }).pipe(
          Stream.map((stored) => userMessageText(stored, threadId.value)),
          Stream.filter((text): text is string => text !== undefined),
        ),
      );
      if (Option.isNone(first)) return;
      yield* launchKickoffRecipe({ threadId: threadId.value, recipe, firstMessage: first.value });
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logError("kickoff recipe: launch failed", { recipeId: recipe.declaredId, cause }),
      ),
      Effect.forkDetach({ startImmediately: true }),
    );
  }),
);

/** Production: the runtime's ONE event sink, by layer reference (t3team-v2Layers.ts). */
export const T3TeamKickoffRecipeLive = T3TeamKickoffRecipe.pipe(Layer.provide(T3TeamEventSinkLayer));
