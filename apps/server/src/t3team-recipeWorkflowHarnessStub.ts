/**
 * The recipe E2E harness's seams onto the engine: what the run did (a recording of every
 * workflow-host operation), what the scripted agent answers, and how a user answers an `askUser`.
 *
 * The model is stubbed at the provider seam (`t3team-workflowStubAgentTurn.ts`); everything the
 * run does goes through the REAL workflow host, so the recording is what production would do.
 */
import type { PackTurnInput } from "@t3team/pack-api";
import { CommandId, MessageId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import type { WorkflowHostPort } from "./t3team-workflowHostPort.ts";
import type { WorkflowStubReply } from "./t3team-workflowStubAgentTurn.ts";

/** One recorded workflow-host operation: its name and the input it was called with. */
export type T3TeamRecipeHarnessOperation = {
  readonly op: keyof WorkflowHostPort;
  readonly input: unknown;
};

export type T3TeamRecipeHarnessCapture = {
  /** Every workflow-host operation the run performed, in order. */
  readonly operations: T3TeamRecipeHarnessOperation[];
  /** Agent prompts the run issued, in order, so a test can assert what was asked. */
  readonly agentPrompts: string[];
};

/** Wrap the host so every operation is recorded before it runs. */
export function recordingWorkflowHostPort(
  host: WorkflowHostPort,
  capture: T3TeamRecipeHarnessCapture,
): WorkflowHostPort {
  const record =
    <K extends keyof WorkflowHostPort>(op: K) =>
    (input: Parameters<WorkflowHostPort[K]>[0]) => {
      capture.operations.push({ op, input });
      return (host[op] as (value: typeof input) => Promise<void>)(input);
    };
  return {
    createThread: record("createThread"),
    startTurn: record("startTurn"),
    postMessage: record("postMessage"),
    upsertActivity: record("upsertActivity"),
    interrupt: record("interrupt"),
    syncRunFacts: record("syncRunFacts"),
  };
}

/** The reply a person's own message gets (an `askUser` answer starts an agent turn too). */
const USER_TURN_REPLY = "Noted.";

/**
 * The scripted agent: workflow prompts consume `replies` in turn order (the last entry repeats
 * if the run takes more turns); a turn a person's message started gets a fixed acknowledgement.
 */
export function harnessResponder(
  replies: ReadonlyArray<string>,
  capture: T3TeamRecipeHarnessCapture,
): (turn: PackTurnInput) => WorkflowStubReply {
  let workflowTurn = 0;
  return (turn) => {
    if (turn.message.createdBy === "user") return USER_TURN_REPLY;
    capture.agentPrompts.push(turn.message.text);
    const index = Math.min(workflowTurn, replies.length - 1);
    workflowTurn += 1;
    return replies[index] ?? "{}";
  };
}

/** Answer a pending `askUser` the way a person does: a message typed on the launch thread. */
export function answerT3TeamRecipeHarnessAsk(input: {
  readonly launchThreadId: string;
  readonly answer: string;
  readonly nonce: string;
}) {
  return Effect.flatMap(ThreadManagementService, (threads) =>
    threads.dispatch({
      type: "message.dispatch",
      commandId: CommandId.make(`harness-user-reply:${input.nonce}`),
      threadId: ThreadId.make(input.launchThreadId),
      messageId: MessageId.make(`harness-user-reply-msg:${input.nonce}`),
      text: input.answer,
      attachments: [],
      dispatchMode: { type: "queue_after_active" },
      createdBy: "user",
      creationSource: "web",
    }),
  );
}
