/**
 * Builds the bounded step re-drive (t3team-workflowEngineTurnRetry.ts) over the live host: V2
 * thread reads, the workflow host's queued turn start, and the run row's journaled budget.
 *
 * Two wirings share it. The workflow reactor passes `runDue` (its serial lane) and its own scope,
 * so a due re-drive is ordered with the step's other tasks and dies with the reactor. Explicit
 * resume entry points (the control card, the resume tools) omit both: a due re-drive then runs
 * itself on a detached fiber — when it has to wait (a run already owns the step), it re-checks
 * after the backoff rather than leaving the restored ask parked with nothing to wake it.
 */
import { CommandId, RunId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

import type { ThreadManagementServiceShape } from "./orchestration-v2/ThreadManagementService.ts";
import type { WorkflowRunRepositoryShape } from "./persistence/Services/WorkflowRuns.ts";
import type { T3TeamWorkflowEngineRegistryShape } from "./t3team-workflowEngineRegistry.ts";
import {
  type InterruptedTurnRetry,
  makeInterruptedTurnRetry,
} from "./t3team-workflowEngineTurnRetry.ts";
import type { T3TeamWorkflowHostShape } from "./t3team-workflowHost.ts";
import type { WorkflowTurnReads } from "./t3team-workflowTurnState.ts";

interface DueRedrive {
  readonly threadId: string;
  readonly correlationId: string;
}

/** e2e override for the re-drive backoff (same pattern as the transient turn retry's). */
const backoffOverrideFromEnv = (): number | undefined => {
  const raw = process.env.T3TEAM_INTERRUPTED_TURN_RETRY_BACKOFF_MS;
  if (raw === undefined) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function makeWorkflowTurnRedriveLive(deps: {
  readonly registry: T3TeamWorkflowEngineRegistryShape;
  readonly threads: WorkflowTurnReads & Pick<ThreadManagementServiceShape, "dispatch">;
  readonly host: Pick<T3TeamWorkflowHostShape, "startTurn">;
  readonly runRepository: Pick<WorkflowRunRepositoryShape, "setTurnRetries">;
  /** Where a due re-drive runs; absent runs it on the armed fiber itself. */
  readonly runDue?: (task: DueRedrive) => Effect.Effect<void>;
  /** Owns the armed fibers; absent forks them detached. */
  readonly scope?: Scope.Scope;
}): InterruptedTurnRetry {
  let self: InterruptedTurnRetry | undefined;
  const runDue = deps.runDue ?? ((task: DueRedrive) => self?.processTurnRetry(task) ?? Effect.void);
  const backoffOverrideMs = backoffOverrideFromEnv();
  const retry = makeInterruptedTurnRetry({
    registry: deps.registry,
    threads: deps.threads,
    startTurn: (input) =>
      deps.host.startTurn(input).pipe(Effect.mapError((error) => error.message)),
    cancelQueuedRun: (threadId, runId) =>
      deps.threads
        .dispatch({
          type: "queued-run.cancel",
          commandId: CommandId.make(`t3team-wf-held:${runId}`),
          threadId: ThreadId.make(threadId),
          runId: RunId.make(runId),
        })
        .pipe(Effect.asVoid, Effect.mapError(String)),
    recordTurnRetries: (runId, turnRetries) =>
      deps.runRepository.setTurnRetries({
        runId,
        turnRetries,
        updatedAt: DateTime.formatIso(DateTime.nowUnsafe()),
      }),
    // Registers the forked fiber in the registry's turn-retry handle map (GHE #411 §3), so a
    // pause/stop that clears this step's pending ask can interrupt it before it fires.
    armTurnRetry: (threadId, correlationId, delayMs) => {
      const due = Effect.suspend(() => {
        deps.registry.removeTurnRetryFiber(threadId, correlationId);
        return runDue({ threadId, correlationId });
      }).pipe(Effect.delay(Duration.millis(delayMs)));
      return (
        deps.scope === undefined ? Effect.forkDetach(due) : Effect.forkIn(due, deps.scope)
      ).pipe(
        Effect.tap((fiber) =>
          Effect.sync(() => deps.registry.registerTurnRetryFiber(threadId, correlationId, fiber)),
        ),
        Effect.asVoid,
      );
    },
    ...(backoffOverrideMs === undefined ? {} : { backoffOverrideMs }),
  });
  self = retry;
  return retry;
}
