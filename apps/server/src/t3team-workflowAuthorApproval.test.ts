/**
 * Author-thread approvals are settled by the production runtime ingestion path —
 * the same function that turns `request.opened` into a user-visible activity —
 * and that activity is never dispatched. An allowlisted broker tool is accepted;
 * a command or file change is declined.
 */
import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  EventId,
  ProviderDriverKind,
  ProviderInstanceId,
  RuntimeRequestId,
  ThreadId,
  type CanonicalRequestType,
  type OrchestrationCommand,
  type ProviderRuntimeEvent,
  type RuntimeEventRawSource,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import * as CheckpointStore from "./checkpointing/CheckpointStore.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProviderRuntimeIngestionLive } from "./orchestration/Layers/ProviderRuntimeIngestion.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./orchestration/Layers/ProjectionSnapshotQuery.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { ProviderRuntimeIngestionService } from "./orchestration/Services/ProviderRuntimeIngestion.ts";
import * as ThreadBackgroundLiveness from "./orchestration/ThreadBackgroundLiveness.ts";
import * as ThreadPlanProgress from "./orchestration/ThreadPlanProgress.ts";
import * as ThreadSilenceWatchdog from "./orchestration/ThreadSilenceWatchdog.ts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { ProviderService, type ProviderServiceShape } from "./provider/Services/ProviderService.ts";
import * as RepositoryIdentityResolver from "./project/RepositoryIdentityResolver.ts";
import { ServerSettingsService } from "./serverSettings.ts";
import {
  registerWorkflowAuthorSession,
  resetWorkflowAuthorSessions,
} from "./t3team-workflowAuthorSession.ts";

const AUTHOR_THREAD = "run-author:author";
const events = Effect.runSync(Queue.unbounded<ProviderRuntimeEvent>());
const decisions = Effect.runSync(
  Queue.unbounded<{ readonly threadId: string; readonly decision: string }>(),
);
const dispatched: OrchestrationCommand[] = [];

const provider = {
  streamEvents: Stream.fromQueue(events),
  respondToRequest: (input: { readonly threadId: ThreadId; readonly decision: string }) =>
    Queue.offer(decisions, {
      threadId: String(input.threadId),
      decision: input.decision,
    }).pipe(Effect.asVoid),
} as unknown as ProviderServiceShape;

const opened = (
  id: string,
  providerKind: string,
  requestType: CanonicalRequestType,
  source: RuntimeEventRawSource,
  method: string,
  args: unknown,
): ProviderRuntimeEvent => ({
  type: "request.opened",
  eventId: EventId.make(id),
  provider: ProviderDriverKind.make(providerKind),
  createdAt: "2026-07-18T00:00:00.000Z",
  threadId: ThreadId.make(AUTHOR_THREAD),
  requestId: RuntimeRequestId.make(id),
  payload: { requestType, args },
  raw: { source, method, payload: args },
});

const cases: ReadonlyArray<{ readonly event: ProviderRuntimeEvent; readonly decision: string }> = [
  {
    decision: "accept",
    event: opened(
      "claude-validate",
      "claudeAgent",
      "dynamic_tool_call",
      "claude.sdk.permission",
      "canUseTool/request",
      { toolName: "mcp__t3-code__t3team_recipe_validate", input: { source: "export default {}" } },
    ),
  },
  {
    decision: "decline",
    event: opened(
      "claude-bash",
      "claudeAgent",
      "command_execution_approval",
      "claude.sdk.permission",
      "canUseTool/request",
      { toolName: "Bash", input: { command: "rm -rf /" } },
    ),
  },
  {
    decision: "decline",
    event: opened(
      "claude-edit",
      "claudeAgent",
      "file_change_approval",
      "claude.sdk.permission",
      "canUseTool/request",
      { toolName: "Edit", input: { file_path: "secret.ts" } },
    ),
  },
  {
    decision: "decline",
    event: opened(
      "claude-status",
      "claudeAgent",
      "dynamic_tool_call",
      "claude.sdk.permission",
      "canUseTool/request",
      { toolName: "mcp__t3-code__t3team_orchestration_status" },
    ),
  },
  {
    decision: "decline",
    event: opened(
      "claude-other-server",
      "claudeAgent",
      "dynamic_tool_call",
      "claude.sdk.permission",
      "canUseTool/request",
      { toolName: "mcp__other__t3team_recipe_validate" },
    ),
  },
  {
    decision: "accept",
    event: opened(
      "codex-validate",
      "codex",
      "dynamic_tool_call",
      "codex.app-server.request",
      "item/tool/call",
      { tool: "t3team_recipe_validate", namespace: "t3-code", arguments: {} },
    ),
  },
  {
    decision: "decline",
    event: opened(
      "codex-command",
      "codex",
      "command_execution_approval",
      "codex.app-server.request",
      "item/commandExecution/requestApproval",
      { command: "rm -rf /" },
    ),
  },
  {
    decision: "decline",
    event: opened(
      "codex-file",
      "codex",
      "file_change_approval",
      "codex.app-server.request",
      "item/fileChange/requestApproval",
      { grantRoot: "/tmp" },
    ),
  },
  {
    decision: "accept",
    event: opened(
      "cursor-validate",
      "cursor",
      "dynamic_tool_call",
      "acp.jsonrpc",
      "session/request_permission",
      { toolCall: { toolCallId: "call-1", title: "t3team_recipe_validate", kind: "other" } },
    ),
  },
  {
    decision: "decline",
    event: opened(
      "cursor-shell",
      "cursor",
      "command_execution_approval",
      "acp.jsonrpc",
      "session/request_permission",
      { toolCall: { toolCallId: "call-2", title: "rm -rf /", kind: "execute" } },
    ),
  },
  {
    decision: "decline",
    event: opened(
      "cursor-edit",
      "cursor",
      "file_change_approval",
      "acp.jsonrpc",
      "session/request_permission",
      { toolCall: { toolCallId: "call-3", title: "Edit secret.ts", kind: "edit" } },
    ),
  },
  {
    // A terminal call whose CLI-generated title equals an allowlisted tool name is still exec.
    decision: "decline",
    event: opened(
      "cursor-exec-spoofed-title",
      "cursor",
      "command_execution_approval",
      "acp.jsonrpc",
      "session/request_permission",
      { toolCall: { toolCallId: "call-4", title: "t3team_recipe_validate", kind: "execute" } },
    ),
  },
];

const engine = {
  dispatch: (command: OrchestrationCommand) =>
    Effect.sync(() => {
      dispatched.push(command);
      return { sequence: dispatched.length };
    }),
  streamDomainEvents: Stream.never,
} as unknown as OrchestrationEngineShape;

const layer = ProviderRuntimeIngestionLive.pipe(
  Layer.provideMerge(OrchestrationProjectionSnapshotQueryLive),
  Layer.provide(ThreadBackgroundLiveness.layer),
  Layer.provide(ThreadPlanProgress.layer),
  Layer.provide(ThreadSilenceWatchdog.layer),
  Layer.provide(ServerSettingsService.layerTest()),
  Layer.provide(Layer.succeed(ProviderService, provider)),
  Layer.provide(Layer.succeed(OrchestrationEngineService, engine)),
  Layer.provide(Layer.succeed(CheckpointStore.CheckpointStore, {} as never)),
  Layer.provide(RepositoryIdentityResolver.layer),
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(NodeServices.layer),
);

it.live("accepts an author tool and declines shell and file requests", () =>
  Effect.scoped(
    Effect.gen(function* () {
      resetWorkflowAuthorSessions();
      yield* Effect.addFinalizer(() => Effect.sync(resetWorkflowAuthorSessions));
      const sql = yield* SqlClient.SqlClient;
      const snapshotQuery = yield* ProjectionSnapshotQuery;
      const ingestion = yield* ProviderRuntimeIngestionService;
      yield* sql`
        INSERT INTO projection_projects (
          project_id, title, workspace_root, default_model_selection_json, scripts_json,
          created_at, updated_at, deleted_at
        ) VALUES (
          'project-author', 'Author', '/tmp/author',
          '{"provider":"codex","model":"gpt"}', '[]',
          '2026-06-08T00:00:00.000Z', '2026-06-08T00:00:01.000Z', NULL
        )
      `;
      yield* sql`
        INSERT INTO projection_threads (
          thread_id, project_id, title, model_selection_json, runtime_mode, interaction_mode,
          branch, worktree_path, retention, latest_turn_id, latest_user_message_at,
          pending_approval_count, pending_user_input_count, has_actionable_proposed_plan,
          created_at, updated_at, archived_at, deleted_at
        ) VALUES (
          ${AUTHOR_THREAD}, 'project-author', 'Orchestration author',
          '{"provider":"codex","model":"gpt"}', 'approval-required', 'plan',
          NULL, NULL, 'ephemeral', NULL, NULL, 0, 0, 0,
          '2026-06-08T00:00:02.000Z', '2026-06-08T00:00:03.000Z', NULL, NULL
        )
      `;
      const visible = yield* snapshotQuery.getThreadRuntimeContext(ThreadId.make(AUTHOR_THREAD));
      assert.isTrue(Option.isSome(visible));
      registerWorkflowAuthorSession({
        runId: "run-author",
        launchThreadId: "launch-1",
        authorThreadId: AUTHOR_THREAD,
        authorModelSelection: createModelSelection(ProviderInstanceId.make("codex"), "gpt"),
        intent: {
          goal: "Write the orchestration.",
          expectedOutcome: "A workflow file.",
          guardrails: ["Do not edit the repository."],
        },
        submit: undefined,
        declined: false,
      });

      yield* ingestion.start();
      for (const item of cases) {
        yield* Queue.offer(events, item.event);
        const decision = yield* Queue.take(decisions).pipe(Effect.timeout("5 seconds"));
        assert.strictEqual(decision.threadId, AUTHOR_THREAD);
        assert.strictEqual(decision.decision, item.decision);
      }
      yield* ingestion.drain;
      assert.isFalse(
        dispatched.some(
          (command) =>
            command.type === "thread.activity.append" && String(command.threadId) === AUTHOR_THREAD,
        ),
      );
    }).pipe(Effect.provide(layer)),
  ),
);
