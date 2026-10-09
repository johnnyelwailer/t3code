/**
 * t3team Claude Tasks on the V2 adapter: TaskCreate/TaskUpdate/TaskList results project as a
 * todo_list plan, as V1 projected them as `turn.plan.updated`.
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
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import * as IdAllocator from "../IdAllocator.ts";
import { ProviderAdapterV2RuntimePolicy, type ProviderAdapterV2Event } from "../ProviderAdapter.ts";
import * as ClaudeAdapterV2 from "./ClaudeAdapterV2.ts";
import {
  applyClaudeTaskToolResult,
  claudeTaskPlanSteps,
  type ClaudeTaskState,
} from "./t3team-claudeTasksPlan.ts";

describe("applyClaudeTaskToolResult", () => {
  it("folds TaskCreate, TaskUpdate and TaskList into plan steps", () => {
    const tasks = new Map<string, ClaudeTaskState>();
    assert.isTrue(
      applyClaudeTaskToolResult(tasks, "TaskCreate", { subject: "Inspect" }, { task: { id: "1" } }),
    );
    assert.isTrue(
      applyClaudeTaskToolResult(
        tasks,
        "TaskCreate",
        { subject: "Ship", blockedBy: ["1"] },
        { task: { id: "2", subject: "Ship" } },
      ),
    );
    assert.isTrue(
      applyClaudeTaskToolResult(tasks, "TaskUpdate", { taskId: "1", status: "in_progress" }, {}),
    );
    // An update that changes nothing, or names an unknown task, projects nothing.
    assert.isFalse(
      applyClaudeTaskToolResult(tasks, "TaskUpdate", { taskId: "1", status: "in_progress" }, {}),
    );
    assert.isFalse(
      applyClaudeTaskToolResult(tasks, "TaskUpdate", { taskId: "9", status: "completed" }, {}),
    );
    assert.deepEqual(claudeTaskPlanSteps(tasks), [
      { id: "task-1", text: "Inspect", status: "running" },
      { id: "task-2", text: "Ship (blocked by #1)", status: "pending" },
    ]);

    assert.isTrue(
      applyClaudeTaskToolResult(
        tasks,
        "TaskList",
        {},
        {
          tasks: [{ id: "2", subject: "Ship", status: "completed", blockedBy: [] }],
        },
      ),
    );
    assert.deepEqual(claudeTaskPlanSteps(tasks), [
      { id: "task-2", text: "Ship", status: "completed" },
    ]);
  });

  it("ignores other tools and results without a task id", () => {
    const tasks = new Map<string, ClaudeTaskState>();
    assert.isFalse(applyClaudeTaskToolResult(tasks, "TodoWrite", { todos: [] }, {}));
    assert.isFalse(applyClaudeTaskToolResult(tasks, "TaskCreate", { subject: "Inspect" }, "ok"));
    assert.equal(tasks.size, 0);
  });
});

const NATIVE_SESSION = "native-thread-t3team-claude-tasks";
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

const assistantTool = (uuid: string, tool: Record<string, unknown>): SDKMessage =>
  ({
    type: "assistant",
    message: {
      model: "claude-sonnet-4-6",
      id: `msg_${uuid}`,
      type: "message",
      role: "assistant",
      content: [{ type: "tool_use", ...tool }],
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
    parent_tool_use_id: null,
    uuid,
    session_id: NATIVE_SESSION,
  }) as unknown as SDKMessage;

const toolResult = (uuid: string, toolUseId: string, toolUseResult: unknown): SDKMessage =>
  ({
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: toolUseId, content: "ok" }],
    },
    tool_use_result: toolUseResult,
    parent_tool_use_id: null,
    uuid,
    session_id: NATIVE_SESSION,
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
          setPermissionMode: () => Effect.void,
          interrupt: Effect.void,
          close: Effect.void,
        }),
      forkSession: () => Effect.die("unused forkSession"),
      subagentLaunchToolUseId: () => Effect.succeed(null),
      assertComplete: Effect.void,
    },
  });
  const threadId = ThreadId.make("thread-t3team-claude-tasks");
  const runtime = yield* adapter.openSession({
    threadId,
    providerSessionId: ProviderSessionId.make("provider-session-t3team-claude-tasks"),
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
  yield* runtime.startTurn({
    appThread: {
      id: threadId,
      projectId: ProjectId.make("project-t3team-claude-tasks"),
      title: "Tasks",
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
    runId: RunId.make("run-t3team-claude-tasks"),
    runOrdinal: 1,
    providerTurnOrdinal: 1,
    attemptId: RunAttemptId.make("attempt-t3team-claude-tasks"),
    rootNodeId: NodeId.make("node-t3team-claude-tasks"),
    providerThread,
    message: {
      createdBy: "user",
      creationSource: "web",
      messageId: MessageId.make("message-t3team-claude-tasks"),
      text: "Track the work as tasks.",
      attachments: [],
    },
    modelSelection: MODEL_SELECTION,
    runtimePolicy: POLICY,
  });
  return { sdkMessages, offered, events };
});

const awaitUntil = (predicate: () => boolean, label: string) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 5000; attempt++) {
      if (predicate()) return;
      yield* Effect.yieldNow;
    }
    return yield* Effect.die(`Timed out waiting for ${label}.`);
  });

describe("ClaudeAdapterV2 t3team Claude Tasks", () => {
  it.effect("projects Claude Tasks tool results as a todo_list plan", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeHarness;
        yield* awaitUntil(() => harness.offered.length === 1, "prompt");
        const todoPlans = () =>
          harness.events.flatMap((event) =>
            event.type === "plan.updated" && event.plan.kind === "todo_list" ? [event.plan] : [],
          );
        const frames = [
          assistantTool("00000000-0000-4000-8000-000000000601", {
            id: "tool-task-create-1",
            name: "TaskCreate",
            input: { subject: "Inspect", description: "Read the code" },
          }),
          toolResult("00000000-0000-4000-8000-000000000602", "tool-task-create-1", {
            task: { id: "1", subject: "Inspect" },
          }),
          assistantTool("00000000-0000-4000-8000-000000000603", {
            id: "tool-task-create-2",
            name: "TaskCreate",
            input: { subject: "Ship", blockedBy: ["1"] },
          }),
          toolResult("00000000-0000-4000-8000-000000000604", "tool-task-create-2", {
            task: { id: "2", subject: "Ship" },
          }),
          assistantTool("00000000-0000-4000-8000-000000000605", {
            id: "tool-task-update-1",
            name: "TaskUpdate",
            input: { taskId: "1", status: "in_progress" },
          }),
          toolResult("00000000-0000-4000-8000-000000000606", "tool-task-update-1", {
            success: true,
            taskId: "1",
            updatedFields: ["status"],
          }),
        ];
        for (const frame of frames) yield* Queue.offer(harness.sdkMessages, frame);
        yield* awaitUntil(() => todoPlans().length >= 3, "three task plan updates");

        const latest = todoPlans().at(-1);
        assert.deepEqual(latest?.kind === "todo_list" ? latest.steps : undefined, [
          { id: "task-1", text: "Inspect", status: "running" },
          { id: "task-2", text: "Ship (blocked by #1)", status: "pending" },
        ]);
        // Each change supersedes the previous list, as successive TodoWrite calls do.
        assert.isTrue(todoPlans().some((plan) => plan.status === "superseded"));
        assert.isTrue(
          harness.events.some(
            (event) =>
              event.type === "turn_item.updated" &&
              event.turnItem.type === "todo_list" &&
              event.turnItem.nativeItemRef?.nativeId === "tool-task-update-1",
          ),
        );
      }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, NodeServices.layer))),
    ),
  );
});
