/**
 * The answer-attribution artifact: it stamps the step's author onto the message that answered it,
 * keyed to that message, WITHOUT changing or hiding the message.
 */

import type { T3TeamMessageWorkflowAuthor } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { workflowAnswerAttributionArtifact } from "./t3team-workflowAnswerAttribution.ts";

const author: T3TeamMessageWorkflowAuthor = {
  kind: "workflow",
  workflowRunId: "run-1",
  stepId: "run-1:3",
  label: "Rewrite the description of the work item",
};

describe("workflowAnswerAttributionArtifact", () => {
  it("records the step author as the answer message's ext, keyed to that message", () => {
    const artifact = workflowAnswerAttributionArtifact({
      threadId: "thread-1",
      messageId: "assistant-7",
      author,
    });
    expect(artifact).toEqual({
      id: "message-ext:assistant-7",
      threadId: "thread-1",
      messageId: "assistant-7",
      kind: "message-ext",
      payload: { author },
    });
  });

  it("never hides the message — observability over gates", () => {
    const { payload } = workflowAnswerAttributionArtifact({
      threadId: "thread-1",
      messageId: "assistant-7",
      author,
    });
    expect(payload).not.toHaveProperty("visibleToUser");
    expect(payload).not.toHaveProperty("visibleToAgent");
  });
});
