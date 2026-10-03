/**
 * Read where a pending `askAgent` step stands on V2 (the effectful half of
 * t3team-workflowTurnRun.ts): find the step's current prompt, resolve the run that answers it,
 * and judge that run. Targeted `getThreadRecords` reads only — the runs, then the answering run's
 * assistant messages and error items — so a check stays cheap on long threads.
 */
import { MessageId, RunId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { ThreadManagementServiceShape } from "./orchestration-v2/ThreadManagementService.ts";
import type { WorkflowPendingAsk } from "./t3team-workflowEngineRegistry.ts";
import { findWorkflowStepPrompt, type WorkflowStepPrompt } from "./t3team-workflowTurnPrompt.ts";
import {
  judgeStepRun,
  resolveStepRun,
  type WorkflowTurnSettlement,
} from "./t3team-workflowTurnRun.ts";

export type WorkflowTurnState =
  /** The step's prompt is not on the thread (or the thread cannot be read): it can never answer. */
  | { readonly kind: "missing" }
  | {
      readonly kind: "settlement";
      readonly promptMessageId: string;
      readonly settlement: WorkflowTurnSettlement;
    };

export type WorkflowTurnReads = Pick<ThreadManagementServiceShape, "getThreadRecords">;

/** The step's latest prompt on the thread, found by its workflow author stamp. */
export const readWorkflowStepPrompt = (
  threads: WorkflowTurnReads,
  threadId: string,
  pending: Pick<WorkflowPendingAsk, "runId" | "correlationId">,
): Effect.Effect<WorkflowStepPrompt | null> =>
  threads.getThreadRecords(ThreadId.make(threadId), ["messages"], { messageRoles: ["user"] }).pipe(
    Effect.map(({ messages }) =>
      findWorkflowStepPrompt(messages, pending.runId, pending.correlationId),
    ),
    Effect.orElseSucceed(() => null),
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
    // A read that cannot land cannot verify the step: treat the thread as unavailable (the
    // caller then fails the run — parking it would hide the failure forever).
    Effect.orElseSucceed(() => ({ kind: "missing" }) as const),
  );
