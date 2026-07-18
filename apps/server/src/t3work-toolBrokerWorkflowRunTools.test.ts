// @effect-diagnostics nodeBuiltinImport:off - test asserts persisted run files on local disk.
/**
 * `t3work.workflow.run` (ephemeral workflows, slice 1) — handler-level acceptance against the
 * REAL durable engine seams: an in-memory SQLite run repo + journal store (post-039 schema with
 * `origin`), the real launch funnel, and a captured orchestration dispatch standing in for the
 * live engine. Covers: argument validation (exactly one of source/workflowPath), pure-compute
 * inline source (completed + output + persisted file), askUser suspension (decision card on the
 * calling thread + `origin='ephemeral'` row), workspace containment, and the concurrency cap.
 */

import * as NodeFS from "node:fs";

import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  type OrchestrationCommand,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { WorkflowJournalStoreLive } from "./persistence/Layers/SqliteJournalStore.ts";
import { WorkflowRunRepositoryLive } from "./persistence/Layers/WorkflowRuns.ts";
import { WorkflowJournalStore } from "./persistence/Services/WorkflowJournalStore.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import { buildRunningWorkflowRunRow } from "./t3work-workflowEngineDurability.ts";
import { makeWorkflowEngineRegistry } from "./t3work-workflowEngineRegistry.ts";
import { callT3workWorkflowRunTool } from "./t3work-toolBrokerBindingWorkflowRun.ts";
import {
  makeWorkflowRunToolHandlers,
  T3WORK_EPHEMERAL_RUN_CAP,
  type T3workWorkflowRunToolHandlers,
} from "./t3work-toolBrokerWorkflowRunTools.ts";

const threadId = ThreadId.make("thread-eph");
const projectId = ProjectId.make("proj-eph");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");

const PURE_SUM_SOURCE = `
import { Schema } from "effect";
export const Inputs = Schema.Struct({ a: Schema.Number, b: Schema.Number });
export const Outputs = Schema.Struct({ sum: Schema.Number });
export const meta = { name: "temp.sum", inputs: Inputs, outputs: Outputs } as const;
const input = Schema.decodeSync(Inputs)(args);
return { sum: input.a + input.b };
`;

const ASK_USER_SOURCE = `
import { Schema } from "effect";
export const Inputs = Schema.Struct({ question: Schema.String });
export const Outputs = Schema.Struct({ approved: Schema.Boolean });
export const meta = {
  name: "temp.approval",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["user"],
} as const;
const input = Schema.decodeSync(Inputs)(args);
if (thread === undefined) throw new Error("temp.approval needs a launch thread");
const Decision = Schema.Struct({ approved: Schema.Boolean });
const decision = await thread.askUser(input.question, { schema: Decision });
return { approved: decision.approved };
`;

const testLayer = it.layer(
  Layer.mergeAll(
    WorkflowRunRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
    WorkflowJournalStoreLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
    SqlitePersistenceMemory,
    NodeServices.layer,
  ),
);

/** Real fs/path + real durable seams over an in-memory DB; dispatch is captured. */
const makeHarness = Effect.fn("makeHarness")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const repo = yield* WorkflowRunRepository;
  const store = yield* WorkflowJournalStore;
  const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({
    prefix: "t3work-ephemeral-run-",
  });
  const dispatched: OrchestrationCommand[] = [];
  const handlers = makeWorkflowRunToolHandlers({
    fileSystem,
    path,
    launch: {
      registry: makeWorkflowEngineRegistry(),
      runRepository: repo,
      journalStore: store,
      rearmScheduler: () => Promise.resolve(),
      dispatch: (command) => {
        dispatched.push(command);
        return Promise.resolve();
      },
    },
    loadThreadProject: () =>
      Effect.succeed({
        project: { workspaceRoot, defaultModelSelection: modelSelection },
        thread: {
          projectId,
          runtimeMode: "full-access" as const,
          interactionMode: "default" as const,
          modelSelection,
        },
      }),
  })(threadId);
  return { handlers, dispatched, workspaceRoot, repo };
});

testLayer("t3work.workflow.run — ephemeral workflow tool", (it) => {
  it.effect("rejects a call with BOTH source and workflowPath, and one with NEITHER", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { handlers } = yield* makeHarness();
        const call = (toolArgs: unknown) =>
          callT3workWorkflowRunTool({
            scopeLabel: "for this thread.",
            toolArgs,
            workflowRunTools: handlers,
          });

        const errorText = (result: { readonly structuredContent?: unknown }) =>
          String((result.structuredContent as { readonly error?: unknown } | undefined)?.error);

        const both = yield* call({ source: "return 1;", workflowPath: "x.workflow.ts" });
        assert.isTrue(both.isError);
        assert.include(errorText(both), "exactly one");

        const neither = yield* call({});
        assert.isTrue(neither.isError);
        assert.include(errorText(neither), "exactly one");
      }),
    ),
  );

  it.effect("runs a pure-compute inline source to completion and persists the file", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { handlers, workspaceRoot, repo } = yield* makeHarness();

        const result = yield* handlers.runWorkflow({
          source: PURE_SUM_SOURCE,
          args: { a: 2, b: 40 },
        });

        assert.strictEqual(result.status, "completed");
        assert.deepStrictEqual(result.output, { sum: 42 });
        // The source file must OUTLIVE the call — resume/rehydrate re-read it from disk.
        const workflowFile = `${workspaceRoot}/.t3work-runs/${result.runId}/workflow.ts`;
        assert.isTrue(NodeFS.existsSync(workflowFile));

        const row = Option.getOrThrow(yield* repo.getById({ runId: result.runId }));
        assert.strictEqual(row.status, "completed");
        assert.strictEqual(row.origin, "ephemeral");
      }),
    ),
  );

  it.effect(
    "suspends an askUser body: decision card on the calling thread + origin='ephemeral' row",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { handlers, dispatched, repo } = yield* makeHarness();

          const result = yield* handlers.runWorkflow({
            source: ASK_USER_SOURCE,
            args: { question: "Ship it?" },
          });

          assert.strictEqual(result.status, "suspended");

          // The ask posted a decision-card message into the CALLING thread and parked there.
          const cards = dispatched.filter(
            (command) => command.type === "thread.message.upsert" && command.threadId === threadId,
          );
          assert.isAbove(cards.length, 0);

          const row = Option.getOrThrow(yield* repo.getById({ runId: result.runId }));
          assert.strictEqual(row.status, "suspended");
          assert.strictEqual(row.origin, "ephemeral");
          assert.strictEqual(row.launchThreadId, threadId);
          assert.strictEqual(row.pendingThreadId, threadId);
          assert.strictEqual(row.pendingKind, "user.input");
        }),
      ),
  );

  it.effect("rejects a workflowPath escaping the workspace root", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { handlers } = yield* makeHarness();
        const result = yield* handlers
          .runWorkflow({ workflowPath: "../outside.workflow.ts" })
          .pipe(Effect.result);
        assert.strictEqual(result._tag, "Failure");
        if (result._tag === "Failure") {
          assert.include(result.failure, "outside");
        }
      }),
    ),
  );

  it.effect(`caps live ephemeral runs at ${T3WORK_EPHEMERAL_RUN_CAP} without writing files`, () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { handlers, workspaceRoot, repo } = yield* makeHarness();

        // Fill the cap with live (suspended/running/sleeping-equivalent) ephemeral rows.
        for (let index = 0; index < T3WORK_EPHEMERAL_RUN_CAP; index += 1) {
          yield* repo.upsert(
            buildRunningWorkflowRunRow({
              runId: `live-${index}`,
              workflowPath: `${workspaceRoot}/.t3work-runs/live-${index}/workflow.ts`,
              args: {},
              launchThreadId: threadId,
              projectId,
              modelSelection,
              runtimeMode: "full-access",
              interactionMode: "default",
              origin: "ephemeral",
              nowIso: "2026-07-17T00:00:00.000Z",
            }),
          );
        }

        const result = yield* handlers
          .runWorkflow({ source: PURE_SUM_SOURCE, args: { a: 1, b: 1 } })
          .pipe(Effect.result);
        assert.strictEqual(result._tag, "Failure");
        if (result._tag === "Failure") {
          assert.include(result.failure, "cap reached");
        }
        // Rejected BEFORE writing anything: no new run directory appeared.
        const entries = NodeFS.existsSync(`${workspaceRoot}/.t3work-runs`)
          ? NodeFS.readdirSync(`${workspaceRoot}/.t3work-runs`)
          : [];
        assert.deepStrictEqual(entries, []);

        // Terminal runs do NOT count against the cap.
        for (let index = 0; index < T3WORK_EPHEMERAL_RUN_CAP; index += 1) {
          yield* repo.clearPending({
            runId: `live-${index}`,
            status: "completed",
            updatedAt: "2026-07-17T00:00:01.000Z",
          });
        }
        const after = yield* handlers.runWorkflow({
          source: PURE_SUM_SOURCE,
          args: { a: 1, b: 1 },
        });
        assert.strictEqual(after.status, "completed");
      }),
    ),
  );
});

// Type-level guard: the binding glue accepts exactly these handlers.
const _handlersType: T3workWorkflowRunToolHandlers | undefined = undefined;
void _handlersType;
