import { ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import type { ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import type { WorkflowRunRepositoryShape } from "./persistence/Services/WorkflowRuns.ts";
import type { T3TeamWorkflowEngineRegistryShape } from "./t3team-workflowEngineRegistry.ts";
import {
  type InterruptedTurnRetry,
  makeInterruptedTurnRetry,
} from "./t3team-workflowEngineTurnRetry.ts";

/** Build the immediate re-drive used by explicit workflow resume entry points. */
export function makeWorkflowTurnRedriveLive(deps: {
  readonly registry: T3TeamWorkflowEngineRegistryShape;
  readonly runRepository: WorkflowRunRepositoryShape;
  readonly orchestration: OrchestrationEngineShape;
  readonly threadQuery: ProjectionSnapshotQueryShape;
}) {
  // Explicit resume re-drives immediately. When the re-drive has to wait (the child thread is
  // busy with a turn that is not ours), it re-checks itself after the backoff — a no-op here
  // would leave the restored ask parked with nothing left to wake it (GHE #405).
  let self: InterruptedTurnRetry | undefined;
  const retry = makeInterruptedTurnRetry({
    registry: deps.registry,
    readThread: (threadId) => deps.threadQuery.getThreadDetailById(ThreadId.make(threadId)),
    recordTurnRetries: (runId, turnRetries) =>
      deps.runRepository.setTurnRetries({
        runId,
        turnRetries,
        updatedAt: DateTime.formatIso(DateTime.nowUnsafe()),
      }),
    armTurnRetry: (threadId, correlationId, delayMs) =>
      Effect.suspend(() => self?.processTurnRetry({ threadId, correlationId }) ?? Effect.void).pipe(
        Effect.delay(Duration.millis(delayMs)),
        Effect.forkDetach,
        Effect.asVoid,
      ),
    dispatch: (command) => deps.orchestration.dispatch(command),
  });
  self = retry;
  return retry;
}
