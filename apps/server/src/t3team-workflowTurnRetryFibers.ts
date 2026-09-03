/**
 * Per-(threadId, correlationId) handle map for ARMED turn-retry re-drive fibers (GHE #411 §3).
 *
 * `armTurnRetry` (both the reactor's and the immediate redrive's) forks the delayed re-drive and
 * registers its fiber here; the ordinary path removes it on its own once the delay elapses and
 * the re-drive actually starts running. A pause or stop that clears a run's pending ask must
 * ALSO interrupt + remove any fiber still armed for that step — otherwise the fiber outlives the
 * pause, and a resume inside its backoff window restores a pending ask with the SAME correlation
 * id, which the stale fiber then matches and re-drives a second time behind the fresh re-drive
 * the resume already issued.
 */
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";

export interface WorkflowTurnRetryFiberMap {
  /** Record the fiber armed for one step's re-drive, replacing any earlier one for the same key. */
  readonly register: (
    threadId: string,
    correlationId: string,
    fiber: Fiber.Fiber<unknown, unknown>,
  ) => void;
  /** Forget the handle without interrupting it — the re-drive already started running. */
  readonly remove: (threadId: string, correlationId: string) => void;
  /** Interrupt the armed fiber for this step, if any, and forget it. Safe to call when nothing
   * is armed. */
  readonly interruptAndRemove: (threadId: string, correlationId: string) => void;
}

const key = (threadId: string, correlationId: string) => `${threadId}:${correlationId}`;

export function makeWorkflowTurnRetryFiberMap(): WorkflowTurnRetryFiberMap {
  const fibers = new Map<string, Fiber.Fiber<unknown, unknown>>();
  return {
    register: (threadId, correlationId, fiber) => {
      fibers.set(key(threadId, correlationId), fiber);
    },
    remove: (threadId, correlationId) => {
      fibers.delete(key(threadId, correlationId));
    },
    interruptAndRemove: (threadId, correlationId) => {
      const mapKey = key(threadId, correlationId);
      const fiber = fibers.get(mapKey);
      if (fiber === undefined) return;
      fibers.delete(mapKey);
      Effect.runFork(Fiber.interrupt(fiber));
    },
  };
}
