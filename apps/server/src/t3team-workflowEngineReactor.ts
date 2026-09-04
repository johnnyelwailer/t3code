/**
 * The workflow-engine resume reactor (Epic 25 §Host wiring) — the one genuinely new production
 * mechanism. It watches orchestration domain events and turns a FINISHED agent turn / a user
 * reply into `appendResolvedEntry` + `resumeWorkflow`, driving a parked run forward.
 *
 * This module owns the wiring: the subscription, the two serial lanes, and the settle timer. The
 * per-task rules live in `t3team-workflowEngineReactorTasks.ts`, and WHICH message of a turn is
 * the answer lives in `t3team-workflowTurnResolution.ts`.
 *
 * Events are drained through a single worker so resumes never interleave: `resume` awaits the
 * replay to its next suspension (which re-registers the new pending ask) before the next task is
 * processed. The due-settlement task rides the same lane for that reason.
 *
 * ── Why the settle is delayed ───────────────────────────────────────────────
 * `ProviderRuntimeIngestion` publishes the idle session (the turn-end signal) BEFORE it flushes
 * an assistant message the provider left unclosed at `turn.completed`. Taking the answer
 * {@link WORKFLOW_TURN_SETTLE_MS} after the signal lets such a straggler land and BE the answer,
 * instead of resolving with the second-to-last message of the turn.
 */

import { ThreadId } from "@t3tools/contracts";
import type { OrchestrationCommand, OrchestrationEvent } from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import {
  createWorkflowReactorTaskHandler,
  type WorkflowReactorTask,
} from "./t3team-workflowEngineReactorTasks.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import {
  makeInterruptedTurnRetry,
  type InterruptedTurnRetryDeps,
} from "./t3team-workflowEngineTurnRetry.ts";
import { stopWorkflowsOwnedByThread } from "./t3team-workflowStopCascade.ts";
import {
  createWorkflowTurnTracker,
  WORKFLOW_TURN_SETTLE_MS,
} from "./t3team-workflowTurnResolution.ts";

export const T3TeamWorkflowEngineReactorLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const orchestration = yield* OrchestrationEngineService;
    const registry = yield* T3TeamWorkflowEngineRegistry;
    // Re-issuing an interrupted step re-reads the step's prompt off the projected thread
    // detail and journals its attempt on the run row — so the query + repo share this layer.
    const threadQuery = yield* ProjectionSnapshotQuery;
    const runRepo = yield* WorkflowRunRepository;
    const tracker = createWorkflowTurnTracker();
    // The reactor's own lifetime scope: the grace-window fibers are attached to it, so shutdown
    // interrupts a pending settle instead of leaking it.
    const reactorScope = yield* Effect.scope;
    // The settle task is armed from inside a handler, so its lane choice needs the workers built
    // below — hence the late binding.
    let enqueueSettle!: (threadId: string, correlationId: string) => Effect.Effect<void>;
    let enqueueTurnRetry!: (task: {
      readonly threadId: string;
      readonly correlationId: string;
    }) => Effect.Effect<void>;
    // e2e backoff override (same pattern as the transient turn retry): the delay resolver reads
    // the env once, at layer build.
    const backoffOverrideRaw = process.env.T3TEAM_INTERRUPTED_TURN_RETRY_BACKOFF_MS;
    const backoffOverride =
      backoffOverrideRaw === undefined
        ? undefined
        : (() => {
            const parsed = Number.parseInt(backoffOverrideRaw, 10);
            return Number.isFinite(parsed) ? parsed : undefined;
          })();
    const turnRetryDeps: InterruptedTurnRetryDeps = {
      registry,
      readThread: (threadId) => threadQuery.getThreadDetailById(ThreadId.make(threadId)),
      recordTurnRetries: (runId, turnRetries) =>
        runRepo.setTurnRetries({
          runId,
          turnRetries,
          updatedAt: DateTime.formatIso(DateTime.nowUnsafe()),
        }),
      // Registers the forked fiber in the registry's turn-retry handle map (GHE #411 §3), so a
      // pause/stop that clears this step's pending ask can interrupt it before it fires.
      armTurnRetry: (threadId, correlationId, delayMs) =>
        Effect.suspend(() => {
          registry.removeTurnRetryFiber(threadId, correlationId);
          return enqueueTurnRetry({ threadId, correlationId });
        }).pipe(
          Effect.delay(Duration.millis(delayMs)),
          Effect.forkIn(reactorScope),
          Effect.tap((fiber) =>
            Effect.sync(() => registry.registerTurnRetryFiber(threadId, correlationId, fiber)),
          ),
          Effect.asVoid,
        ),
      dispatch: (command: OrchestrationCommand) => orchestration.dispatch(command),
      ...(backoffOverride === undefined ? {} : { backoffOverrideMs: backoffOverride }),
    };
    const handle = createWorkflowReactorTaskHandler({
      registry,
      tracker,
      // Attribution is cosmetic: `result` swallows a failed stamp so a run never dies because a
      // label could not be written onto its answer.
      dispatch: (command) => orchestration.dispatch(command).pipe(Effect.result),
      armSettle: (threadId, correlationId) =>
        Effect.suspend(() => enqueueSettle(threadId, correlationId)).pipe(
          Effect.delay(Duration.millis(WORKFLOW_TURN_SETTLE_MS)),
          Effect.forkIn(reactorScope),
          Effect.asVoid,
        ),
      turnRetry: makeInterruptedTurnRetry(turnRetryDeps),
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
    // the worker waits for the replay while the replay waits for events queued behind itself.
    // Keep live settlements ordered on a separate lane so they can unblock the parent replay.
    const liveWorker = yield* makeDrainableWorker(processSafely);
    const lane = (threadId: string) =>
      registry.peekPending(threadId)?.resolveLive === undefined ? worker : liveWorker;
    enqueueSettle = (threadId, correlationId) =>
      lane(threadId).enqueue({ kind: "settle", threadId, correlationId });
    // The re-drive rides the SAME serial lane as its settle: the due task re-validates the
    // pending ask before re-issuing, so a reply/advance in the meantime wins.
    enqueueTurnRetry = (task) => lane(task.threadId).enqueue({ kind: "turn-retry", ...task });

    const stopOwnedWorkflows = Effect.fn("stopOwnedWorkflows")(function* (
      event: Extract<OrchestrationEvent, { type: "thread.turn-interrupt-requested" }>,
    ) {
      tracker.forget(event.payload.threadId);
      yield* Effect.promise(() =>
        stopWorkflowsOwnedByThread({
          registry,
          threadId: event.payload.threadId,
          createdAt: event.payload.createdAt,
          dispatch: (command) =>
            Effect.runPromise(orchestration.dispatch(command)).then(() => undefined),
        }),
      );
    });

    yield* Effect.forkScoped(
      Stream.runForEach(orchestration.streamDomainEvents, (event) => {
        if (event.type === "thread.message-sent" || event.type === "thread.session-set") {
          return lane(event.payload.threadId).enqueue({ kind: "event", event });
        }
        if (event.type === "thread.turn-interrupt-requested") return stopOwnedWorkflows(event);
        return Effect.void;
      }),
    );
  }),
);
