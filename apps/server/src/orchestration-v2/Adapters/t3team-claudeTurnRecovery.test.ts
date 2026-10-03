/**
 * t3team Claude turn recovery on the V2 adapter: abort phrasings settle a turn as interrupted,
 * and a transient gateway failure re-drives the same turn behind a provider-retry item.
 */
import type { SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  ClaudeSettings,
  MessageId,
  NodeId,
  ProjectId,
  ProviderInstanceId,
  ProviderSessionId,
  RunAttemptId,
  RunId,
  ThreadId,
} from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import * as IdAllocator from "../IdAllocator.ts";
import { ProviderAdapterV2RuntimePolicy, type ProviderAdapterV2Event } from "../ProviderAdapter.ts";
import * as ClaudeAdapterV2 from "./ClaudeAdapterV2.ts";
import {
  isClaudeInterruptedCause,
  isClaudeInterruptedFailure,
  isClaudeInterruptedMessage,
  planClaudeGatewayRedrive,
} from "./t3team-claudeTurnRecovery.ts";

describe("isClaudeInterruptedMessage", () => {
  it("recognizes the established interruption phrasings", () => {
    assert.isTrue(isClaudeInterruptedMessage("All fibers interrupted without error"));
    assert.isTrue(isClaudeInterruptedMessage("Request was aborted"));
    assert.isTrue(isClaudeInterruptedMessage("Interrupted by user"));
  });

  it("treats DOMException AbortError phrasing as an interruption, not a fault", () => {
    assert.isTrue(isClaudeInterruptedMessage("This operation was aborted"));
    assert.isTrue(isClaudeInterruptedMessage("this operation was aborted"));
    assert.isTrue(
      isClaudeInterruptedFailure(
        new ClaudeAdapterV2.ClaudeAgentSdkQueryRunnerError({
          method: "query",
          cause: new Error("This operation was aborted"),
        }),
      ),
    );
  });

  it("leaves real provider faults unclassified", () => {
    assert.isFalse(isClaudeInterruptedMessage("upstream connect error"));
    assert.isFalse(
      isClaudeInterruptedMessage('Request failed with status 423: {"type":"reservation_error"}'),
    );
    assert.isFalse(isClaudeInterruptedFailure(new Error("socket hang up")));
    // A dead process ends the stream with a bare interruption: that is a failure, not an abort.
    assert.isFalse(isClaudeInterruptedCause(Cause.interrupt()));
    assert.isTrue(isClaudeInterruptedCause(Cause.fail(new Error("This operation was aborted"))));
  });
});

describe("planClaudeGatewayRedrive", () => {
  const reservation = 'Request failed with status 423: {"retry_after_seconds": 7}';

  it("re-drives a transient gateway failure at the gateway's directive, five times per turn", () => {
    const turn = {};
    const first = planClaudeGatewayRedrive(turn, reservation);
    assert.deepInclude(first, { attempt: 1, maxAttempts: 5, retryDelayMs: 7_000 });
    assert.include(first?.text ?? "", "Automatic retry 1 of 5");
    for (let attempt = 2; attempt <= 5; attempt += 1) {
      assert.equal(planClaudeGatewayRedrive(turn, reservation)?.attempt, attempt);
    }
    assert.isNull(planClaudeGatewayRedrive(turn, reservation));
    // A new turn starts with a fresh budget.
    assert.equal(planClaudeGatewayRedrive({}, reservation)?.attempt, 1);
  });

  it("never re-drives a permanent failure", () => {
    assert.isNull(planClaudeGatewayRedrive({}, "Request failed with status 401: unauthorized"));
    assert.isNull(planClaudeGatewayRedrive({}, ""));
  });
});

const NATIVE_SESSION = "native-thread-t3team-recovery";
const MODEL_SELECTION = {
  instanceId: ProviderInstanceId.make(ClaudeAdapterV2.CLAUDE_PROVIDER),
  model: "claude-sonnet-4-6",
};
const POLICY = ProviderAdapterV2RuntimePolicy.make({
  runtimeMode: "full-access",
  interactionMode: "default",
  cwd: "/workspace",
});
const SETTINGS = Schema.decodeSync(ClaudeSettings)({});

const resultFrame = (input: {
  readonly uuid: string;
  readonly echo?: string;
  readonly errors?: ReadonlyArray<string>;
}): SDKMessage =>
  ({
    type: "result",
    subtype: input.errors === undefined ? "success" : "error_during_execution",
    duration_ms: 10,
    duration_api_ms: 10,
    is_error: input.errors !== undefined,
    num_turns: 1,
    result: "done",
    stop_reason: "end_turn",
    total_cost_usd: 0,
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
    uuid: input.uuid,
    session_id: NATIVE_SESSION,
    terminal_reason: input.errors === undefined ? "completed" : "model_error",
    ...(input.errors === undefined ? {} : { errors: input.errors }),
    ...(input.echo === undefined ? {} : { user_message_uuid: input.echo }),
  }) as unknown as SDKMessage;

const makeHarness = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const attachmentsDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-claude-" });
  const sdkMessages = yield* Queue.unbounded<
    SDKMessage,
    ClaudeAdapterV2.ClaudeAgentSdkQueryRunnerError
  >();
  const offered: Array<SDKUserMessage> = [];
  const adapter = ClaudeAdapterV2.makeClaudeAdapterV2({
    instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
    settings: SETTINGS,
    environment: {},
    attachmentsDir,
    fileSystem,
    path: yield* Path.Path,
    idAllocator: yield* IdAllocator.IdAllocatorV2,
    continuationRequests: { offer: () => Effect.void },
    queryRunner: {
      allocateSessionId: Effect.succeed(NATIVE_SESSION),
      open: () =>
        Effect.succeed({
          messages: Stream.fromQueue(sdkMessages),
          offer: (message: SDKUserMessage) => Effect.sync(() => void offered.push(message)),
          setModel: () => Effect.void,
          interrupt: Effect.void,
          close: Effect.void,
        }),
      forkSession: () => Effect.die("unused forkSession"),
      subagentLaunchToolUseId: () => Effect.succeed(null),
      assertComplete: Effect.void,
    },
  });
  const threadId = ThreadId.make("thread-t3team-claude-recovery");
  const runtime = yield* adapter.openSession({
    threadId,
    providerSessionId: ProviderSessionId.make("provider-session-t3team-claude-recovery"),
    modelSelection: MODEL_SELECTION,
    runtimePolicy: POLICY,
  });
  const providerThread = yield* runtime.ensureThread({
    threadId,
    modelSelection: MODEL_SELECTION,
    runtimePolicy: POLICY,
  });
  const events: Array<ProviderAdapterV2Event> = [];
  yield* runtime.events.pipe(
    Stream.runForEach((event) => Effect.sync(() => void events.push(event))),
    Effect.forkScoped,
  );
  const now = yield* DateTime.now;
  const attemptId = RunAttemptId.make("attempt-t3team-claude-recovery");
  yield* runtime.startTurn({
    appThread: {
      id: threadId,
      projectId: ProjectId.make("project-t3team-claude-recovery"),
      title: "Recovery",
      providerInstanceId: MODEL_SELECTION.instanceId,
      modelSelection: MODEL_SELECTION,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      activeProviderThreadId: providerThread.id,
      lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: threadId },
      forkedFrom: null,
      createdBy: "user",
      creationSource: "web",
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      lastVisitedAt: null,
      deletedAt: null,
    },
    threadId,
    runId: RunId.make("run-t3team-claude-recovery"),
    runOrdinal: 1,
    providerTurnOrdinal: 1,
    attemptId,
    rootNodeId: NodeId.make("node-t3team-claude-recovery"),
    providerThread,
    message: {
      createdBy: "user",
      creationSource: "web",
      messageId: MessageId.make("message-t3team-claude-recovery"),
      text: "Build it.",
      attachments: [],
    },
    modelSelection: MODEL_SELECTION,
    runtimePolicy: POLICY,
  });
  const terminals = () =>
    events.filter(
      (event): event is Extract<ProviderAdapterV2Event, { type: "turn.terminal" }> =>
        event.type === "turn.terminal",
    );
  return { sdkMessages, offered, events, terminals };
});

const awaitUntil = (predicate: () => boolean, label: string) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 5000; attempt++) {
      if (predicate()) return;
      yield* Effect.yieldNow;
    }
    return yield* Effect.die(`Timed out waiting for ${label}.`);
  });

const testLayer = Layer.merge(IdAllocator.layer, NodeServices.layer);

describe("ClaudeAdapterV2 t3team recovery", () => {
  it.effect("re-drives a transient gateway failure inside the same turn", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeHarness;
        yield* awaitUntil(() => harness.offered.length === 1, "first prompt");
        const firstUuid = harness.offered[0]?.uuid;
        yield* Queue.offer(
          harness.sdkMessages,
          resultFrame({
            uuid: "00000000-0000-4000-8000-000000000301",
            ...(firstUuid === undefined ? {} : { echo: firstUuid }),
            errors: ['Request failed with status 423: {"retry_after_seconds": 2}'],
          }),
        );
        yield* awaitUntil(
          () =>
            harness.events.some(
              (event) =>
                event.type === "turn_item.updated" &&
                event.turnItem.type === "error" &&
                event.turnItem.status === "running",
            ),
          "retry item",
        );
        assert.lengthOf(harness.terminals(), 0);
        assert.lengthOf(harness.offered, 1);

        yield* TestClock.adjust("3 seconds");
        yield* awaitUntil(() => harness.offered.length === 2, "re-drive prompt");
        const redrive = harness.offered[1];
        assert.notEqual(redrive?.uuid, firstUuid);
        const content = redrive?.message.content;
        const redriveText = Array.isArray(content)
          ? content.map((block) => (block.type === "text" ? block.text : "")).join("")
          : (content ?? "");
        assert.include(redriveText, "Automatic retry 1 of 5");

        yield* Queue.offer(
          harness.sdkMessages,
          resultFrame({
            uuid: "00000000-0000-4000-8000-000000000302",
            ...(redrive?.uuid === undefined ? {} : { echo: redrive.uuid }),
          }),
        );
        yield* awaitUntil(() => harness.terminals().length === 1, "terminal");
        assert.equal(harness.terminals()[0]?.status, "completed");
      }).pipe(Effect.provide(testLayer)),
    ),
  );

  it.effect("settles a turn whose stream died with an abort error as interrupted", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeHarness;
        yield* awaitUntil(() => harness.offered.length === 1, "first prompt");
        yield* Queue.failCause(
          harness.sdkMessages,
          Cause.fail(
            new ClaudeAdapterV2.ClaudeAgentSdkQueryRunnerError({
              method: "query",
              cause: new Error("This operation was aborted"),
            }),
          ),
        );
        yield* awaitUntil(() => harness.terminals().length === 1, "terminal");
        assert.equal(harness.terminals()[0]?.status, "interrupted");
      }).pipe(Effect.provide(testLayer)),
    ),
  );
});
