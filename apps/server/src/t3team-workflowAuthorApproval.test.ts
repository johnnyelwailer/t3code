/**
 * A provider approval for an author thread is declined by the production runtime
 * ingestion path — the same function that turns `request.opened` into a user-visible
 * activity — and that activity is never dispatched.
 */
import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  EventId,
  ProviderDriverKind,
  ProviderInstanceId,
  RuntimeRequestId,
  ThreadId,
  type OrchestrationCommand,
  type ProviderRuntimeEvent,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Deferred from "effect/Deferred";
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
const decided = Deferred.makeUnsafe<{ readonly threadId: string; readonly decision: string }>();
const dispatched: OrchestrationCommand[] = [];

const provider = {
  streamEvents: Stream.fromQueue(events),
  respondToRequest: (input: { readonly threadId: ThreadId; readonly decision: string }) =>
    Deferred.succeed(decided, {
      threadId: String(input.threadId),
      decision: input.decision,
    }).pipe(Effect.asVoid),
} as unknown as ProviderServiceShape;

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

it.live("declines request.opened for an author thread and does not surface it", () =>
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

      const event = {
        type: "request.opened",
        eventId: EventId.make("evt-author-approval"),
        provider: ProviderDriverKind.make("codex"),
        createdAt: "2026-07-18T00:00:00.000Z",
        threadId: ThreadId.make(AUTHOR_THREAD),
        requestId: RuntimeRequestId.make("approval-author"),
        payload: {
          requestType: "command_execution_approval",
          detail: "rm -rf /",
        },
      } satisfies ProviderRuntimeEvent;

      yield* ingestion.start();
      yield* Queue.offer(events, event);
      const decision = yield* Deferred.await(decided).pipe(Effect.timeout("5 seconds"));
      yield* ingestion.drain;
      assert.strictEqual(decision.threadId, AUTHOR_THREAD);
      assert.strictEqual(decision.decision, "decline");
      assert.isFalse(
        dispatched.some(
          (command) =>
            command.type === "thread.activity.append" && String(command.threadId) === AUTHOR_THREAD,
        ),
      );
    }).pipe(Effect.provide(layer)),
  ),
);
