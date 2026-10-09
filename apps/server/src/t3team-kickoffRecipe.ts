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
 * already ran the recipe, live or ended, nor while a run of it is active elsewhere, so a restarted
 * server starts no second run beside a live one. A finished setup of an earlier session does not
 * block it (a session restores its predecessors' runs), and a restart may set up again on another
 * thread; `/machine-setup` runs it again on purpose.
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

const KICKOFF_RECIPE_ENV = "T3CODE_KICKOFF_RECIPE";

/** The pack recipe the env names, or why there is none to launch. */
export function resolveKickoffRecipe(
  recipeId: string | undefined,
  sources: ReadonlyArray<PackRecipeSource>,
):
  | { readonly kind: "none" }
  | { readonly kind: "missing"; readonly id: string }
  | PackRecipeSource {
  const id = recipeId?.trim() ?? "";
  if (id.length === 0) return { kind: "none" };
  return sources.find((source) => source.declaredId === id) ?? { kind: "missing", id };
}

/** The runs that ran `workflowPath`, whatever their status. */
export function runsOfWorkflow<Run extends { readonly workflowPath: string }>(
  runs: ReadonlyArray<Run>,
  workflowPath: string,
): ReadonlyArray<Run> {
  return runs.filter((run) => run.workflowPath === workflowPath);
}

/**
 * Statuses of a run that is actively in progress. A run that is `paused`, `sleeping` or `watching`
 * waits on something outside this session (an explicit resume, a clock, a signal) and must not
 * keep a new session from setting up.
 */
const ACTIVE_STATUSES = ["authoring", "queued", "running", "suspended"] as const;

/**
 * The runs that stop a kickoff: any run of the recipe on this thread, ended or not, and a run of
 * it still active elsewhere. A restart re-arms the kickoff and the next first message may come on
 * another thread; an active run (one waiting on its question, say) must not be launched twice. An
 * ended run on another thread does not count: a session restores the workspace of earlier
 * sessions, and their finished setups must not stop this one from setting up.
 */
export function blockingKickoffRuns<
  Run extends { readonly runId: string; readonly workflowPath: string; readonly status: string },
>(
  threadRuns: ReadonlyArray<Run>,
  activeElsewhere: ReadonlyArray<Run>,
  workflowPath: string,
): ReadonlyArray<Run> {
  const active: ReadonlyArray<string> = ACTIVE_STATUSES;
  const blocking = runsOfWorkflow(
    [...threadRuns, ...activeElsewhere.filter((run) => active.includes(run.status))],
    workflowPath,
  );
  return [...new Map(blocking.map((run) => [run.runId, run])).values()];
}

export const launchKickoffRecipe = Effect.fn("launchKickoffRecipe")(function* (input: {
  readonly threadId: ThreadId;
  readonly recipe: PackRecipeSource;
  readonly firstMessage: string;
}) {
  const runs = yield* WorkflowRunRepository;
  const path = yield* Path.Path;
  const workflowPath = path.join(input.recipe.recipeRoot, "workflow.ts");
  const earlier = blockingKickoffRuns(
    yield* runs.listLiveByLaunchThread({ launchThreadId: input.threadId, includeEnded: true }),
    (yield* Effect.forEach(ACTIVE_STATUSES, (status) => runs.listByStatus({ status }))).flat(),
    workflowPath,
  );
  if (earlier.length > 0) {
    yield* Effect.logInfo("kickoff recipe: it already ran or is running", {
      threadId: input.threadId,
      runIds: earlier.map((run) => run.runId),
    });
    return null;
  }
  const { thread } = yield* loadThreadProjectContext(input.threadId);
  return yield* launchRecipeWorkflow({
    threadId: input.threadId,
    recipePath: input.recipe.recipeRoot,
    workflowPath,
    args: { firstMessage: input.firstMessage },
    modelSelection: thread.modelSelection,
    runtimeMode: thread.runtimeMode,
    interactionMode: thread.interactionMode,
    recipe: { id: input.recipe.declaredId, version: input.recipe.packVersion },
  });
});

/** A message the user typed, and the thread it was typed on; undefined for anything else. */
export function typedUserMessage({
  event,
}: Pick<OrchestrationV2StoredEvent, "event">): { threadId: ThreadId; text: string } | undefined {
  return event.type === "message.updated" &&
    event.payload.role === "user" &&
    event.payload.createdBy === "user"
    ? { threadId: event.threadId, text: event.payload.text }
    : undefined;
}

/** The first welcome: the server is up. The snapshot covers a welcome published earlier. */
const serverWelcome = Effect.gen(function* () {
  const lifecycle = yield* ServerLifecycleEvents.ServerLifecycleEvents;
  const events = Stream.merge(
    lifecycle.stream,
    Stream.fromEffect(lifecycle.snapshot).pipe(
      Stream.flatMap((snapshot) => Stream.fromIterable(snapshot.events)),
    ),
  );
  return yield* Stream.runHead(events.pipe(Stream.filter((event) => event.type === "welcome")));
});

/**
 * Arms on the welcome, launches on the first message the user types on any thread. A desktop
 * starting a session from a draft creates a new thread in the environment instead of using its
 * bootstrap thread, so the bootstrap thread alone would never see the first message.
 */
const T3TeamKickoffRecipe = Layer.effectDiscard(
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
      if (Option.isNone(yield* serverWelcome)) return;
      const first = yield* Stream.runHead(
        eventSink.stream({ afterSequence: bootSequence }).pipe(
          Stream.map(typedUserMessage),
          Stream.filter((message) => message !== undefined),
        ),
      );
      if (Option.isNone(first)) return;
      yield* launchKickoffRecipe({
        threadId: first.value.threadId,
        recipe,
        firstMessage: first.value.text,
      });
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logError("kickoff recipe: launch failed", { recipeId: recipe.declaredId, cause }),
      ),
      Effect.forkDetach({ startImmediately: true }),
    );
  }),
);

/** Production: the runtime's ONE event sink, by layer reference (t3team-v2Layers.ts). */
export const T3TeamKickoffRecipeLive = T3TeamKickoffRecipe.pipe(
  Layer.provide(T3TeamEventSinkLayer),
);
