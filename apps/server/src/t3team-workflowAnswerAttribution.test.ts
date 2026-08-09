/**
 * The answer-attribution command. Its two jobs are to add the author WITHOUT changing the message,
 * and to be recognisable as already-stamped so the reactor does not stamp its own upsert forever.
 */

import { type T3TeamMessageWorkflowAuthor, TurnId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  isWorkflowAttributed,
  workflowAnswerAttributionCommand,
} from "./t3team-workflowAnswerAttribution.ts";

const author: T3TeamMessageWorkflowAuthor = {
  kind: "workflow",
  workflowRunId: "run-1",
  stepId: "run-1:3",
  label: "Rewrite the description of NXAI-6",
};

describe("workflowAnswerAttributionCommand", () => {
  it("updates the message in place: same id, same text, same turn, plus the author", () => {
    const command = workflowAnswerAttributionCommand({
      threadId: "thread-1",
      messageId: "assistant-7",
      text: "## Goal\nRound to two decimals.",
      turnId: TurnId.make("turn-9"),
      author,
      commandId: "uuid-1",
      createdAt: "2026-07-28T00:00:00.000Z",
    });

    expect(command.type).toBe("thread.message.upsert");
    expect(command.type === "thread.message.upsert" ? command.message : undefined).toEqual({
      messageId: "assistant-7",
      role: "assistant",
      text: "## Goal\nRound to two decimals.",
      turnId: "turn-9",
      streaming: false,
      t3teamExt: { author },
    });
  });

  it("never hides the message — observability over gates", () => {
    const command = workflowAnswerAttributionCommand({
      threadId: "thread-1",
      messageId: "assistant-7",
      text: "output",
      turnId: null,
      author,
      commandId: "uuid-2",
      createdAt: "2026-07-28T00:00:00.000Z",
    });
    const ext = command.type === "thread.message.upsert" ? command.message.t3teamExt : undefined;
    expect(ext?.visibleToUser).toBeUndefined();
    expect(ext?.visibleToAgent).toBeUndefined();
  });
});

describe("isWorkflowAttributed", () => {
  it("recognises its own stamp, so the reactor skips it instead of looping", () => {
    expect(isWorkflowAttributed({ author })).toBe(true);
  });

  it("does not mistake other authors, or none, for a workflow stamp", () => {
    expect(isWorkflowAttributed(undefined)).toBe(false);
    expect(isWorkflowAttributed({})).toBe(false);
    expect(isWorkflowAttributed({ author: { kind: "system", workflowRunId: "run-1" } })).toBe(
      false,
    );
    expect(
      isWorkflowAttributed({
        author: { kind: "actor", threadId: "t", projectId: "p", title: "Peer" },
      }),
    ).toBe(false);
  });
});
