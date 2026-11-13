import {
  MessageId,
  RunId,
  ThreadId,
  TurnItemId,
  type OrchestrationV2ProjectedTurnItem,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { buildThreadFeed, deriveThreadFeedPresentation } from "./threadActivity";

const threadId = ThreadId.make("thread-report");
const runId = RunId.make("run-report");
const report = `Befund: ${"Die Ursache liegt im Faltungsfilter der Zeitleiste. ".repeat(12)}`;

function base(id: string, ordinal: number) {
  const at = DateTime.makeUnsafe(`2026-11-13T09:00:0${ordinal}Z`);
  return {
    id: TurnItemId.make(id),
    threadId,
    runId,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal,
    status: "completed" as const,
    title: null,
    startedAt: at,
    completedAt: at,
    updatedAt: at,
  };
}

function projected(item: OrchestrationV2TurnItem): OrchestrationV2ProjectedTurnItem {
  return {
    position: item.ordinal,
    visibility: "local",
    sourceThreadId: threadId,
    sourceItemId: item.id,
    item,
  };
}

function say(id: string, ordinal: number, text: string): OrchestrationV2TurnItem {
  return {
    ...base(id, ordinal),
    type: "assistant_message",
    messageId: MessageId.make(id),
    text,
    streaming: false,
  };
}

function write(id: string, ordinal: number): OrchestrationV2TurnItem {
  return { ...base(id, ordinal), type: "command_execution", input: "vp check", exitCode: 0 };
}

describe("t3teamTurnReportIds in the settled mobile feed", () => {
  it("keeps a long mid-turn report outside the Worked for fold", () => {
    const prompt: OrchestrationV2TurnItem = {
      ...base("prompt", 0),
      type: "user_message",
      messageId: MessageId.make("prompt"),
      createdBy: "user",
      creationSource: "mobile",
      inputIntent: "turn_start",
      text: "Analysiere den Fehler",
      attachments: [],
    };
    const feed = buildThreadFeed(
      [
        prompt,
        say("progress", 1, "Ich schaue mir die Datei an."),
        write("read", 2),
        say("report", 3, report),
        write("write", 4),
        say("closing", 5, "Bericht gespeichert."),
      ].map(projected),
    );

    const ids = deriveThreadFeedPresentation(feed, null, new Set()).map((entry) => entry.id);

    expect(ids).toEqual(["prompt", "run-fold:run-report", "report", "closing"]);
  });
});
