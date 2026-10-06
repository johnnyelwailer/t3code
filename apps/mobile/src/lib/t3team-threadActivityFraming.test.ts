import {
  MessageId,
  RunId,
  ThreadId,
  TurnItemId,
  withT3TeamMessageExtContext,
  type OrchestrationV2ProjectedTurnItem,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { buildThreadFeed } from "./threadActivity";

const threadId = ThreadId.make("thread-1");
const at = DateTime.makeUnsafe("2026-10-04T10:00:00.000Z");

function userMessage(
  id: string,
  patch: Partial<Extract<OrchestrationV2TurnItem, { type: "user_message" }>>,
): OrchestrationV2ProjectedTurnItem {
  const item: OrchestrationV2TurnItem = {
    id: TurnItemId.make(id),
    threadId,
    runId: RunId.make(`run-${id}`),
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: 0,
    status: "completed",
    title: null,
    startedAt: at,
    completedAt: at,
    updatedAt: at,
    type: "user_message",
    messageId: MessageId.make(id),
    createdBy: "user",
    creationSource: "mobile",
    inputIntent: "turn_start",
    text: id,
    attachments: [],
    ...patch,
  };
  return {
    position: 0,
    visibility: "local",
    sourceThreadId: threadId,
    sourceItemId: item.id,
    item,
  };
}

describe("buildThreadFeed (t3team framing)", () => {
  it("drops fork framing but keeps the person's messages and workflow prompts", () => {
    const feed = buildThreadFeed([
      userMessage("typed", {}),
      // Hidden transport of a widget action.
      userMessage("widget-transport", {
        context: withT3TeamMessageExtContext({ visibleToUser: false }),
      }),
      // The transient-retry continuation: anonymous and system-authored.
      userMessage("retry-continuation", { createdBy: "system", creationSource: "server" }),
      // A workflow askAgent prompt: system-authored, but attributed.
      userMessage("workflow-prompt", {
        createdBy: "system",
        creationSource: "server",
        context: withT3TeamMessageExtContext({
          author: { kind: "workflow", workflowRunId: "run-1", stepId: "step-1", label: "Review" },
        }),
      }),
    ]);

    expect(feed.map((entry) => (entry.type === "message" ? entry.message.id : entry.type))).toEqual(
      ["typed", "workflow-prompt"],
    );
  });
});
