/**
 * Scripted V2 thread records for workflow step tests: one step run (its prompt is
 * {@link STEP_PROMPT}), its messages and turn items, served through a `getThreadRecords` fake.
 */
import {
  MessageId,
  type OrchestrationV2ConversationMessage,
  type OrchestrationV2Run,
  type OrchestrationV2TurnItem,
  RunId,
  ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { WORKFLOW_STUB_MODEL_SELECTION } from "./t3team-workflowStubAgentTurn.ts";
import type { WorkflowTurnReads } from "./t3team-workflowTurnState.ts";

export const STEP_THREAD = "child-thread";
export const STEP_PROMPT = "prompt-1";
export const AT = DateTime.makeUnsafe("2026-10-03T00:00:00.000Z");

export const v2Run = (status: OrchestrationV2Run["status"]): OrchestrationV2Run => ({
  id: RunId.make("run:child:1"),
  threadId: ThreadId.make(STEP_THREAD),
  ordinal: 1,
  providerInstanceId: WORKFLOW_STUB_MODEL_SELECTION.instanceId,
  modelSelection: WORKFLOW_STUB_MODEL_SELECTION,
  providerThreadId: null,
  userMessageId: MessageId.make(STEP_PROMPT),
  rootNodeId: null,
  activeAttemptId: null,
  status,
  requestedAt: AT,
  startedAt: AT,
  completedAt: null,
  checkpointId: null,
  contextHandoffId: null,
});

export const message = (
  overrides: Partial<OrchestrationV2ConversationMessage> &
    Pick<OrchestrationV2ConversationMessage, "role" | "text">,
): OrchestrationV2ConversationMessage => ({
  id: MessageId.make(`m-${overrides.text}`),
  threadId: ThreadId.make(STEP_THREAD),
  runId: RunId.make("run:child:1"),
  nodeId: null,
  attachments: [],
  streaming: false,
  createdAt: AT,
  updatedAt: AT,
  createdBy: "agent",
  creationSource: "provider",
  ...overrides,
});

export const failureItem = (text: string): OrchestrationV2TurnItem => ({
  id: TurnItemId.make("err-1"),
  threadId: ThreadId.make(STEP_THREAD),
  runId: RunId.make("run:child:1"),
  nodeId: null,
  providerThreadId: null,
  providerTurnId: null,
  nativeItemRef: null,
  parentItemId: null,
  ordinal: 9,
  status: "failed",
  title: null,
  startedAt: AT,
  completedAt: AT,
  updatedAt: AT,
  type: "error",
  failure: { class: "provider_error", message: text, code: null, retryable: true },
});

/** Scripted V2 thread records: one step run plus its messages and items. */
export const records = (input: {
  readonly run?: OrchestrationV2Run;
  readonly messages?: ReadonlyArray<OrchestrationV2ConversationMessage>;
  readonly turnItems?: ReadonlyArray<OrchestrationV2TurnItem>;
}): WorkflowTurnReads => ({
  getThreadRecords: ((
    _threadId: ThreadId,
    _fields: unknown,
    filter?: { messageRoles?: ReadonlyArray<string> },
  ) =>
    Effect.succeed({
      runs: input.run === undefined ? [] : [input.run],
      messages: (input.messages ?? []).filter(
        (entry) => filter?.messageRoles === undefined || filter.messageRoles.includes(entry.role),
      ),
      turnItems: input.turnItems ?? [],
    })) as unknown as WorkflowTurnReads["getThreadRecords"],
});
