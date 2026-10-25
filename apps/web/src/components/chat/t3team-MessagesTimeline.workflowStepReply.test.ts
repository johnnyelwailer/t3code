import { MessageId, RunId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { TimelineEntry } from "../../session-logic";
import type { ChatMessage } from "../../types";
import { deriveMessagesTimelineRows } from "./MessagesTimeline.logic";

const at = "2026-10-23T15:49:09.056Z";
const stepRun = RunId.make("run:step");
const plainRun = RunId.make("run:plain");

const messageEntry = (message: Omit<ChatMessage, "createdAt" | "updatedAt">): TimelineEntry => ({
  id: message.id,
  kind: "message",
  createdAt: at,
  message: { ...message, createdAt: at, updatedAt: at },
});

const workflowPrompt = messageEntry({
  id: MessageId.make("t3team-wf-turn:wf-1:9:attempt"),
  role: "user",
  text: "Return exactly one JSON object: apkVerified, gates.",
  runId: stepRun,
  streaming: false,
  createdBy: "system",
  t3teamExt: {
    author: { kind: "workflow", workflowRunId: "wf-1", stepId: "wf-1:9", label: "Verify APK" },
  },
});

const reply = (id: string, runId: RunId) =>
  messageEntry({
    id: MessageId.make(id),
    role: "assistant",
    text: '{"apkVerified":false}',
    runId,
    streaming: false,
  });

function workflowStepReplyIds(timelineEntries: ReadonlyArray<TimelineEntry>) {
  return deriveMessagesTimelineRows({
    timelineEntries,
    isWorking: false,
    turnDiffSummaries: [],
    supportsConversationRollback: false,
  }).flatMap((row) => (row.kind === "message" && row.workflowStepReply ? [row.message.id] : []));
}

describe("workflow step replies", () => {
  it("marks the replies of a run a workflow step prompt started, and nothing else", () => {
    const entries = [
      workflowPrompt,
      reply("step-reply", stepRun),
      messageEntry({
        id: MessageId.make("person"),
        role: "user",
        text: "Give me JSON",
        runId: plainRun,
        streaming: false,
      }),
      reply("plain-reply", plainRun),
    ];
    expect(workflowStepReplyIds(entries)).toEqual(["step-reply"]);
  });
});
