import { assert, describe, it } from "@effect/vitest";
import {
  OrchestrationV2ConversationMessage,
  OrchestrationV2Run,
  OrchestrationV2TurnItem,
  RunId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { turnInputJson } from "./t3team-pack-driver.fixtures.ts";
import { PackCodec } from "./t3team-pack-driverCodec.ts";
import { makeRemoteTurnEvents } from "./t3team-remoteEnvironmentTurnEvents.ts";
import { remoteTurnProgress } from "./t3team-remoteEnvironmentTurn.ts";

const turn = Schema.decodeUnknownSync(PackCodec.turnInput)(
  turnInputJson("thread-child", "provider-session-1"),
);
const decodeRun = Schema.decodeUnknownSync(Schema.toCodecJson(OrchestrationV2Run));
const decodeMessage = Schema.decodeUnknownSync(
  Schema.toCodecJson(OrchestrationV2ConversationMessage),
);
const AT = "2026-10-24T22:00:00.000Z";
const nowIso = () => DateTime.formatIso(DateTime.makeUnsafe(AT));

const run = (status: string, userMessageId: string = turn.message.messageId) =>
  decodeRun({
    id: "remote-run-1",
    threadId: "remote-thread",
    ordinal: 1,
    providerInstanceId: "nexplore",
    modelSelection: { instanceId: "nexplore", model: "Standard" },
    providerThreadId: null,
    userMessageId,
    rootNodeId: null,
    activeAttemptId: null,
    status,
    requestedAt: AT,
    startedAt: AT,
    completedAt: null,
    checkpointId: null,
    contextHandoffId: null,
  });

const assistant = (id: string, text: string) =>
  decodeMessage({
    id,
    threadId: "remote-thread",
    runId: "remote-run-1",
    nodeId: null,
    role: "assistant",
    text,
    attachments: [],
    streaming: false,
    createdAt: AT,
    updatedAt: AT,
    createdBy: "agent",
    creationSource: "provider",
  });

describe("remoteTurnProgress", () => {
  it("is empty until the remote server runs the turn's message", () => {
    assert.deepStrictEqual(
      remoteTurnProgress(
        { runs: [run("running", "another-message")], messages: [], turnItems: [] },
        turn.message.messageId,
      ),
      { runId: null, assistant: [], terminal: null },
    );
  });

  it("follows the run's assistant messages until it completes", () => {
    const running = remoteTurnProgress(
      { runs: [run("running")], messages: [assistant("m1", "Working")], turnItems: [] },
      turn.message.messageId,
    );
    assert.deepStrictEqual(running, {
      runId: RunId.make("remote-run-1"),
      assistant: [{ id: "m1", text: "Working" }],
      terminal: null,
    });
    const done = remoteTurnProgress(
      { runs: [run("completed")], messages: [assistant("m1", "Done")], turnItems: [] },
      turn.message.messageId,
    );
    assert.deepStrictEqual(done.terminal, { status: "completed" });
  });

  it("carries the last answer into a failure", () => {
    const failed = remoteTurnProgress(
      { runs: [run("failed")], messages: [assistant("m1", "Model not available")], turnItems: [] },
      turn.message.messageId,
    );
    assert.deepStrictEqual(failed.terminal, {
      status: "failed",
      message: "The child's run on the cloud session failed: Model not available",
    });
  });
});

const decodeTurnItem = Schema.decodeUnknownSync(Schema.toCodecJson(OrchestrationV2TurnItem));

const errorItem = decodeTurnItem({
  id: "turn-item:error",
  threadId: "remote-thread",
  runId: "remote-run-1",
  nodeId: null,
  type: "error",
  failure: {
    class: "provider_error",
    message: "Nexplore AI is unavailable: Request timed out.",
    code: null,
    retryable: null,
  },
  providerThreadId: null,
  providerTurnId: null,
  nativeItemRef: null,
  parentItemId: null,
  ordinal: 2,
  status: "failed",
  title: null,
  startedAt: AT,
  completedAt: AT,
  updatedAt: AT,
});

describe("remoteTurnProgress failure reason", () => {
  it("carries the remote run's own error into the failure", () => {
    const failed = remoteTurnProgress(
      { runs: [run("failed")], messages: [], turnItems: [errorItem] },
      turn.message.messageId,
    );
    assert.deepStrictEqual(failed.terminal, {
      status: "failed",
      message:
        "The child's run on the cloud session failed: Nexplore AI is unavailable: Request timed out.",
    });
  });
});

describe("makeRemoteTurnEvents", () => {
  it.effect("builds events every adapter consumer accepts", () =>
    Effect.gen(function* () {
      const events = makeRemoteTurnEvents(turn, nowIso);
      const running = yield* events.running();
      assert.strictEqual(running.type, "provider_turn.updated");
      const streamed = yield* events.assistant([{ id: "m1", text: "Working" }], true);
      assert.deepStrictEqual(
        streamed.map((event) => event.type),
        ["message.updated", "turn_item.updated"],
      );
      const completed = yield* events.terminal({ status: "completed" }, 1);
      assert.deepStrictEqual(
        completed.map((event) => (event.type === "turn.terminal" ? event.status : event.type)),
        ["provider_turn.updated", "completed"],
      );
      const failed = yield* events.terminal({ status: "failed", message: "Session ended" }, 1);
      const terminal = failed[1];
      assert.isTrue(terminal?.type === "turn.terminal" && terminal.status === "failed");
      if (terminal?.type === "turn.terminal" && terminal.status === "failed") {
        assert.strictEqual(terminal.failure.message, "Session ended");
      }
    }),
  );
});
