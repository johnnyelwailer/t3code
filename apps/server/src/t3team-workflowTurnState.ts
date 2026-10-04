/**
 * Read where a pending `askAgent` step stands on V2 (the effectful half of
 * t3team-workflowTurnRun.ts): find the step's current prompt, resolve the run that answers it,
 * and judge that run. Targeted `getThreadRecords` reads only — the runs, then the answering run's
 * assistant messages and error items — so a check stays cheap on long threads.
 */
import { MessageId, RunId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";

import type { ThreadManagementServiceShape } from "./orchestration-v2/ThreadManagementService.ts";
import type { WorkflowPendingAsk } from "./t3team-workflowEngineRegistry.ts";
import { findWorkflowStepPrompt, type WorkflowStepPrompt } from "./t3team-workflowTurnPrompt.ts";
import {
  judgeStepRun,
  resolveStepRun,
  type WorkflowTurnSettlement,
} from "./t3team-workflowTurnRun.ts";

export type WorkflowTurnState =
  /** The step's prompt (or the thread) is definitively gone: it can never answer. */
  | { readonly kind: "missing" }
  /** A read failed this time (a store error): nothing is known, so look again later. */
  | { readonly kind: "unreadable" }
  | {
      readonly kind: "settlement";
      readonly promptMessageId: string;
      readonly settlement: WorkflowTurnSettlement;
    };

export type WorkflowTurnReads = Pick<ThreadManagementServiceShape, "getThreadRecords">;

type ReadError = Effect.Error<ReturnType<WorkflowTurnReads["getThreadRecords"]>>;

/** The read failed because the thread itself does not exist — a definitive absence. */
const isThreadGone = (error: ReadError) =>
  Predicate.hasProperty(error, "cause") &&
  Predicate.hasProperty(error.cause, "_tag") &&
  error.cause._tag === "ProjectionStoreThreadNotFoundError";

/**
 * The step's latest prompt on the thread, found by its workflow author stamp; `null` when it is
 * definitively not there. Fails only when the thread could not be read (worth another look).
 */
export const readWorkflowStepPrompt = (
  threads: WorkflowTurnReads,
  threadId: string,
  pending: Pick<WorkflowPendingAsk, "runId" | "correlationId">,
): Effect.Effect<WorkflowStepPrompt | null, ReadError> =>
  threads.getThreadRecords(ThreadId.make(threadId), ["messages"], { messageRoles: ["user"] }).pipe(
    Effect.map(({ messages }) =>
      findWorkflowStepPrompt(messages, pending.runId, pending.correlationId),
    ),
    Effect.catchIf(isThreadGone, () => Effect.succeed(null)),
  );

export const readWorkflowTurnState = (
  threads: WorkflowTurnReads,
  threadId: string,
  pending: WorkflowPendingAsk,
): Effect.Effect<WorkflowTurnState> =>
  Effect.gen(function* () {
    const id = ThreadId.make(threadId);
    // A hot ask knows its prompt before the dispatch commits; a rehydrated one finds it again.
    const promptMessageId =
      pending.promptMessageId ??
      (yield* readWorkflowStepPrompt(threads, threadId, pending))?.messageId;
    if (promptMessageId === undefined) return { kind: "missing" } as const;
    const { runs } = yield* threads.getThreadRecords(id, ["runs"]);
    const run = resolveStepRun(runs, promptMessageId);
    if (run === undefined) {
      // The prompt is still being dispatched (hot) — or it landed without a run (it cannot answer).
      if (pending.promptMessageId !== undefined) {
        const { messages } = yield* threads.getThreadRecords(id, ["messages"], {
          messageIds: [MessageId.make(promptMessageId)],
        });
        if (messages.length === 0) {
          return { kind: "settlement", promptMessageId, settlement: { kind: "pending" } } as const;
        }
      }
      return { kind: "missing" } as const;
    }
    const runId = RunId.make(run.id);
    const records = yield* threads.getThreadRecords(id, ["messages", "turnItems"], {
      messageRunIds: [runId],
      messageRoles: ["assistant"],
      turnItemRunId: runId,
      turnItemTypes: ["assistant_message", "error"],
    });
    return { kind: "settlement", promptMessageId, settlement: judgeStepRun(records, run) } as const;
  }).pipe(
    // Only a thread that is gone is a definitive answer; any other read error (an SQL error under
    // load) says nothing about the step, so the caller keeps it parked and looks again.
    Effect.catch((error) =>
      isThreadGone(error)
        ? Effect.succeed({ kind: "missing" } as const)
        : Effect.logWarning("t3team workflow step state unreadable", { threadId, error }).pipe(
            Effect.as({ kind: "unreadable" } as const),
          ),
    ),
  );
