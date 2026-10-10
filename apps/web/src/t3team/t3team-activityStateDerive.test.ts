import {
  MessageId,
  type OrchestrationV2TurnItem,
  RunId,
  RuntimeRequestId,
  ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { deriveT3TeamActivityState } from "./t3team-activityStateDerive";

const run = RunId.make("run-2");
const at = DateTime.makeUnsafe("2026-10-01T10:00:00.000Z");
const base = {
  threadId: ThreadId.make("thread-1"),
  runId: run,
  nodeId: null,
  providerThreadId: null,
  providerTurnId: null,
  nativeItemRef: null,
  parentItemId: null,
  title: null,
  startedAt: at,
  completedAt: null,
  updatedAt: at,
};
let ordinal = 0;
const item = <T extends Record<string, unknown>>(fields: T) =>
  ({
    ...base,
    id: TurnItemId.make(`item-${ordinal}`),
    ordinal: ordinal++,
    ...fields,
  }) as unknown as OrchestrationV2TurnItem;

const reasoning = (streaming: boolean) =>
  item({ type: "reasoning", text: "…", streaming, status: streaming ? "running" : "completed" });
const assistant = (streaming: boolean) =>
  item({
    type: "assistant_message",
    messageId: MessageId.make(`m-${ordinal}`),
    text: "…",
    streaming,
    status: streaming ? "running" : "completed",
  });
const command = (status: "running" | "completed") =>
  item({ type: "command_execution", input: "ls", status });

const derive = (turnItems: ReadonlyArray<OrchestrationV2TurnItem>, waitingOnUser = false) =>
  deriveT3TeamActivityState({ isWorking: true, waitingOnUser, activeRunId: run, turnItems });

describe("deriveT3TeamActivityState", () => {
  it("is absent while the thread is not working", () => {
    expect(
      deriveT3TeamActivityState({
        isWorking: false,
        waitingOnUser: false,
        activeRunId: run,
        turnItems: [reasoning(true)],
      }),
    ).toBeNull();
  });

  it("reads the in-flight item of the active run", () => {
    expect(derive([command("completed"), reasoning(true)])).toBe("thinking");
    expect(derive([reasoning(false), assistant(true)])).toBe("writing");
    expect(derive([assistant(false), command("running")])).toBe("working");
  });

  it("waits while the user owes an answer", () => {
    expect(derive([command("running")], true)).toBe("waiting");
    const question = item({
      type: "user_input_request",
      requestId: RuntimeRequestId.make("q-1"),
      questions: [],
      status: "waiting",
    });
    expect(derive([question])).toBe("waiting");
  });

  it("ignores an older run's leftovers and reads a quiet live run as thinking", () => {
    const stale = { ...command("running"), runId: RunId.make("run-1") } as OrchestrationV2TurnItem;
    expect(derive([stale, assistant(false)])).toBe("thinking");
  });
});
