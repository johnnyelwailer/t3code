/**
 * The workflow-engine resume reactor (Epic 25 §Host wiring). It watches orchestration V2 and turns
 * a FINISHED agent step / a user reply into `appendResolvedEntry` + `resumeWorkflow`, driving a
 * parked run forward.
 *
 * This module owns the wiring: the event subscription, the two serial lanes and the durable
 * sweep. The per-task rules live in `t3team-workflowEngineReactorTasks.ts`, and WHICH message of
 * a step's run is the answer lives in `t3team-workflowTurnRun.ts`.
 *
 * Triggers:
 *   • a terminal `run.updated` re-checks the thread's pending `askAgent` step and posts the
 *     run's held terminal notices (t3team-workflowHost.ts `flushHeld`);
 *   • a message a person posts answers the thread's pending `askUser`;
 *   • a user Stop (`run_interrupt_request` from a client command) on a launch thread stops the
 *     workflows it launched;
 *   • a durable sweep (`Scheduler.register`, 5 s tick) re-checks every pending `askAgent` step.
 *     The live tail does not replay events missed across a restart or a race with the step's
 *     own dispatch; the sweep derives due work from the registry and V2 state instead.
 *
 * Tasks drain through one worker per lane so resumes never interleave: `resume` awaits the replay
 * to its next suspension (which re-registers the new pending ask) before the next task runs.
 */
import type { OrchestrationV2StoredEvent } from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as EventSink from "./orchestration-v2/EventSink.ts";
import {
  isTerminalRunStatus,
  ThreadManagementService,
} from "./orchestration-v2/ThreadManagementService.ts";
import { WorkflowRunRepository } from "./persistence/WorkflowRuns.ts";
import * as Scheduler from "./scheduling/Scheduler.ts";
import { forkParked } from "./serverActivation.ts";
import { isUserStopCommandId } from "./t3team-actorMessageReactor.ts";
import { T3TeamThreadArtifactsStore } from "./t3team-v2/t3team-threadArtifactsStore.ts";
import { T3TeamEventSinkLayer } from "./t3team-v2/t3team-v2Layers.ts";
import { workflowAnswerAttributionArtifact } from "./t3team-workflowAnswerAttribution.ts";
import {
  createWorkflowReactorTaskHandler,
  type WorkflowReactorTask,
} from "./t3team-workflowEngineReactorTasks.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { T3TeamWorkflowHost, toWorkflowHostPort } from "./t3team-workflowHost.ts";
import { stopWorkflowsOwnedByThread } from "./t3team-workflowStopCascade.ts";
import { makeWorkflowTurnRedriveLive } from "./t3team-workflowTurnRedriveLive.ts";

/** Reply message ids already folded in: an update of the same message never answers twice. */
const MAX_SEEN_REPLIES = 512;

/**
 * The reactor over whatever `EventSinkV2` the build provides — tests hand it their orchestrator's
 * own sink; production uses {@link T3TeamWorkflowEngineReactorLive}.
 */
export const T3TeamWorkflowEngineReactorLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const threads = yield* ThreadManagementService;
    const sink = yield* EventSink.EventSinkV2;
    const registry = yield* T3TeamWorkflowEngineRegistry;
    const runRepo = yield* WorkflowRunRepository;
    const host = yield* T3TeamWorkflowHost;
    const artifacts = yield* T3TeamThreadArtifactsStore;
    const scheduler = yield* Scheduler.Scheduler;
    const reactorScope = yield* Effect.scope;
    // The re-drive is armed from inside a handler, so its lane choice needs the workers built
    // below — hence the late binding.
    let enqueue!: (task: WorkflowReactorTask) => Effect.Effect<void>;

    // A due re-drive rides the SAME serial lane as the step's checks: it re-judges the step
    // before re-issuing, so an answer or a continuation in the meantime wins.
    const turnRetry = makeWorkflowTurnRedriveLive({
      registry,
      threads,
      host,
      runRepository: runRepo,
      runDue: (task) => enqueue({ kind: "turn-retry", ...task }),
      scope: reactorScope,
    });
    const handle = createWorkflowReactorTaskHandler({
      registry,
      threads,
      turnRetry,
      // Attribution is cosmetic: a failed stamp never fails the run it answered.
      attributeAnswer: ({ threadId, messageId, pending }) =>
        pending.author === undefined
          ? Effect.void
          : artifacts
              .upsert(
                workflowAnswerAttributionArtifact({ threadId, messageId, author: pending.author }),
              )
              .pipe(Effect.ignore),
    });
    const traced = Effect.fn("processWorkflowEngineReactorTask")(handle);
    const processSafely = (task: WorkflowReactorTask) =>
      traced(task).pipe(
        Effect.catchCause((cause) => {
          if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
          return Effect.logWarning("t3team workflow-engine reactor failed to process a task", {
            taskKind: task.kind,
            cause: Cause.pretty(cause),
          });
        }),
      );

    const worker = yield* makeDrainableWorker(processSafely);
    // A durable resume may replay into a live composition (for example parallel(agent(...))).
    // That replay waits for its live child turns. If those replies use the same serial worker,
    // the worker waits for the replay while the replay waits for tasks queued behind itself.
    // Keep live settlements on a separate lane so they can unblock the parent replay.
    const liveWorker = yield* makeDrainableWorker(processSafely);
    const lane = (threadId: string) =>
      registry.peekPending(threadId)?.resolveLive === undefined ? worker : liveWorker;
    enqueue = (task) => lane(task.threadId).enqueue(task);

    const seenReplies = new Set<string>();
    const firstSighting = (messageId: string) => {
      if (seenReplies.has(messageId)) return false;
      seenReplies.add(messageId);
      if (seenReplies.size > MAX_SEEN_REPLIES) {
        seenReplies.delete(seenReplies.values().next().value!);
      }
      return true;
    };

    // Log a failure and carry on; an interruption (shutdown) still ends the fiber.
    const logged =
      (message: string) =>
      <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A | void> =>
        effect.pipe(
          Effect.catchCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.interrupt
              : Effect.logWarning(message, { cause: Cause.pretty(cause) }),
          ),
        );

    const stopOwnedWorkflows = (threadId: string) =>
      Effect.promise(() =>
        stopWorkflowsOwnedByThread({
          registry,
          threadId,
          host: toWorkflowHostPort(host),
        }),
      );

    const onStored = ({ commandId, event }: OrchestrationV2StoredEvent): Effect.Effect<void> => {
      const threadId: string = event.threadId;
      if (event.type === "run.updated" && isTerminalRunStatus(event.payload.status)) {
        return Effect.all(
          [
            enqueue({ kind: "check", threadId }),
            host.flushHeld(threadId).pipe(logged("t3team workflow held notice flush failed")),
          ],
          { discard: true },
        );
      }
      if (
        event.type === "message.updated" &&
        event.payload.role === "user" &&
        event.payload.createdBy === "user" &&
        firstSighting(event.payload.id)
      ) {
        return enqueue({ kind: "user-message", threadId, message: event.payload });
      }
      if (
        event.type === "turn-item.updated" &&
        event.payload.type === "run_interrupt_request" &&
        isUserStopCommandId(commandId === null ? null : String(commandId))
      ) {
        return stopOwnedWorkflows(threadId);
      }
      return Effect.void;
    };

    const sweep = Effect.gen(function* () {
      for (const threadId of registry.pendingThreadIds()) {
        if (registry.peekPending(threadId)?.kind === "thread.turn") {
          yield* enqueue({ kind: "check", threadId });
        }
      }
      for (const threadId of host.heldThreadIds()) {
        yield* host.flushHeld(threadId).pipe(Effect.ignore);
      }
    });

    // Live tail only: history before this point is covered by boot rehydration and the sweep.
    const liveTail = Stream.unwrap(
      sink.latestSequence().pipe(Effect.map((latest) => sink.stream({ afterSequence: latest }))),
    );
    yield* forkParked(scheduler.register("t3team-workflow-turns", sweep));
    yield* forkParked(
      Stream.runForEach(liveTail, (stored) =>
        onStored(stored).pipe(logged("t3team workflow reactor event handling failed")),
      ).pipe(logged("t3team workflow reactor event stream failed")),
    );
  }),
).pipe(Layer.provide(Scheduler.layer));

/** Production wiring: the runtime's shared event sink, by reference (t3team-v2Layers.ts). */
export const T3TeamWorkflowEngineReactorLive = T3TeamWorkflowEngineReactorLayer.pipe(
  Layer.provide(T3TeamEventSinkLayer),
);
