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
import { setTimeout as sleep } from "node:timers/promises";

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
import { makeWorkflowEngineRegistry } from "./t3work-workflowEngineRegistry.ts";
import {
  buildRunningWorkflowRunRow,
  makeWorkflowRunLifecycle,
} from "./t3work-workflowEngineDurability.ts";
import { callT3workWorkflowRunTool } from "./t3work-toolBrokerBindingWorkflowRun.ts";
import {
  makeWorkflowRunToolHandlers,
  type T3workWorkflowRunToolHandlers,
} from "./t3work-toolBrokerWorkflowRunTools.ts";
import { workflowAdmissionQueue } from "./t3work-workflowAdmissionQueue.ts";
import { setWorkflowEphemeralConcurrencyPolicy } from "./t3work-workflowEphemeralConcurrencyPolicy.ts";

const threadId = ThreadId.make("thread-eph");
const projectId = ProjectId.make("proj-eph");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const intent = {
  goal: "Calculate or collect the requested workflow result.",
  expectedOutcome: "A validated workflow result.",
  guardrails: ["Do not modify files outside the workflow run directory."],
} as const;

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

const waitForRunStatus = Effect.fn("waitForRunStatus")(function* (
  repo: typeof WorkflowRunRepository.Service,
  runId: string,
  status: "completed" | "suspended",
) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const row = yield* repo.getById({ runId });
    if (Option.isSome(row) && row.value.status === status) return row.value;
    // Detached workflow fibers run on the live runtime. Poll with a real timer rather than the
    // @effect/vitest virtual clock, which does not advance while this test waits.
    yield* Effect.promise(() => sleep(10));
  }
  return yield* Effect.fail(`workflow ${runId} did not reach ${status}`);
});

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
  const registry = makeWorkflowEngineRegistry();
  const handlers = makeWorkflowRunToolHandlers({
    fileSystem,
    path,
    launch: {
      registry,
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
  return { handlers, dispatched, workspaceRoot, repo, registry };
});

testLayer("t3work.workflow.run — ephemeral workflow tool", (it) => {
  it.effect("returns an explicit workflow-UI handoff through the broker result", () =>
    Effect.gen(function* () {
      const result = yield* callT3workWorkflowRunTool({
        scopeLabel: "for this thread.",
        toolArgs: { source: PURE_SUM_SOURCE, intent },
        workflowRunTools: {
          runWorkflow: () =>
            Effect.succeed({
              ok: true as const,
              runId: "run-handoff",
              status: "accepted" as const,
              handoff: "workflow-ui" as const,
            }),
        },
      });

      assert.deepInclude(result.structuredContent, {
        status: "accepted",
        handoff: "workflow-ui",
      });
      assert.include(result.content[0]?.text ?? "", '"handoff": "workflow-ui"');
    }),
  );

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

        const both = yield* call({ source: "return 1;", workflowPath: "x.workflow.ts", intent });
        assert.isTrue(both.isError);
        assert.include(errorText(both), "exactly one");

        const neither = yield* call({ intent });
        assert.isTrue(neither.isError);
        assert.include(errorText(neither), "exactly one");

        const blankGoal = yield* call({
          source: PURE_SUM_SOURCE,
          intent: { ...intent, goal: "  " },
        });
        assert.isTrue(blankGoal.isError);
        assert.include(errorText(blankGoal), "nonblank intent.goal");

        const blankGuardrail = yield* call({
          source: PURE_SUM_SOURCE,
          intent: { ...intent, guardrails: [" "] },
        });
        assert.isTrue(blankGuardrail.isError);
        assert.include(errorText(blankGuardrail), "nonblank guardrail");
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
          intent,
        });

        assert.strictEqual(result.status, "accepted");
        assert.strictEqual(result.handoff, "workflow-ui");
        // The source file must OUTLIVE the call — resume/rehydrate re-read it from disk.
        const workflowFile = `${workspaceRoot}/.t3work-runs/${result.runId}/workflow.ts`;
        assert.isTrue(NodeFS.existsSync(workflowFile));

        const row = yield* waitForRunStatus(repo, result.runId, "completed");
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
            intent,
          });

          assert.strictEqual(result.status, "accepted");
          assert.strictEqual(result.handoff, "workflow-ui");

          // The ask posted a decision-card message into the CALLING thread and parked there.
          const cards = dispatched.filter(
            (command) => command.type === "thread.message.upsert" && command.threadId === threadId,
          );
          assert.isAbove(cards.length, 0);

          const row = yield* waitForRunStatus(repo, result.runId, "suspended");
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
          .runWorkflow({ workflowPath: "../outside.workflow.ts", intent })
          .pipe(Effect.result);
        assert.strictEqual(result._tag, "Failure");
        if (result._tag === "Failure") {
          assert.include(result.failure, "outside");
        }
      }),
    ),
  );

  it.effect(
    "accepts a valid run immediately and durably queues it until FIFO capacity is free",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          workflowAdmissionQueue.resetForTests();
          setWorkflowEphemeralConcurrencyPolicy({ maxActiveSteps: 1 });
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              workflowAdmissionQueue.resetForTests();
              setWorkflowEphemeralConcurrencyPolicy({ maxActiveSteps: 8 });
            }),
          );
          yield* Effect.promise(() => workflowAdmissionQueue.acquire("blocker"));
          const { handlers, workspaceRoot, repo } = yield* makeHarness();

          const result = yield* handlers.runWorkflow({
            source: PURE_SUM_SOURCE,
            args: { a: 2, b: 3 },
            intent,
          });
          assert.strictEqual(result.status, "accepted");
          assert.isTrue(
            NodeFS.existsSync(`${workspaceRoot}/.t3work-runs/${result.runId}/workflow.ts`),
          );
          assert.strictEqual(
            Option.getOrThrow(yield* repo.getById({ runId: result.runId })).status,
            "queued",
          );
          workflowAdmissionQueue.release("blocker");
          const completed = yield* waitForRunStatus(repo, result.runId, "completed");
          assert.strictEqual(completed.status, "completed");
        }),
      ),
  );

  it.effect("a racing Stop tombstone prevents recordActive from reviving a cancelled run", () =>
    Effect.scoped(
      Effect.gen(function* () {
        workflowAdmissionQueue.resetForTests();
        const { repo, workspaceRoot } = yield* makeHarness();
        const row = {
          ...buildRunningWorkflowRunRow({
            runId: "stop-race",
            workflowPath: `${workspaceRoot}/stop-race.workflow.ts`,
            args: {},
            launchThreadId: threadId,
            projectId,
            modelSelection,
            runtimeMode: "full-access" as const,
            interactionMode: "default" as const,
            origin: "ephemeral" as const,
            nowIso: "2026-07-19T00:00:00.000Z",
          }),
          status: "queued" as const,
        };
        yield* repo.upsert(row);
        const lifecycle = makeWorkflowRunLifecycle({
          repo,
          row,
          nowIso: () => "2026-07-19T00:00:01.000Z",
        });
        const activating = lifecycle.recordActive();
        workflowAdmissionQueue.cancel(row.runId);
        yield* repo.clearPending({
          runId: row.runId,
          status: "cancelled",
          updatedAt: "2026-07-19T00:00:02.000Z",
        });
        assert.isFalse(yield* Effect.promise(() => activating));
        assert.strictEqual(
          Option.getOrThrow(yield* repo.getById({ runId: row.runId })).status,
          "cancelled",
        );
      }),
    ),
  );

  it.effect("a sleeping wake queued for capacity cannot overwrite a racing Pause", () =>
    Effect.scoped(
      Effect.gen(function* () {
        workflowAdmissionQueue.resetForTests();
        setWorkflowEphemeralConcurrencyPolicy({ maxActiveSteps: 1 });
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            workflowAdmissionQueue.resetForTests();
            setWorkflowEphemeralConcurrencyPolicy({ maxActiveSteps: 8 });
          }),
        );
        yield* Effect.promise(() => workflowAdmissionQueue.acquire("wake-blocker"));
        const { repo, workspaceRoot } = yield* makeHarness();
        const row = buildRunningWorkflowRunRow({
          runId: "pause-wake-race",
          workflowPath: `${workspaceRoot}/pause-wake.workflow.ts`,
          args: {},
          launchThreadId: threadId,
          projectId,
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          origin: "ephemeral",
          nowIso: "2026-07-19T00:00:00.000Z",
        });
        yield* repo.upsert(row);
        yield* repo.setSleeping({
          runId: row.runId,
          wakeAt: "2026-07-19T00:10:00.000Z",
          correlationId: `${row.runId}:1`,
          updatedAt: "2026-07-19T00:00:01.000Z",
        });
        const lifecycle = makeWorkflowRunLifecycle({
          repo,
          row,
          nowIso: () => "2026-07-19T00:00:02.000Z",
        });
        const activating = lifecycle.recordActive();
        for (let attempt = 0; attempt < 20; attempt += 1) {
          if (workflowAdmissionQueue.snapshot().queued.includes(row.runId)) break;
          yield* Effect.yieldNow;
        }
        yield* repo.setStatus({
          runId: row.runId,
          status: "paused",
          updatedAt: "2026-07-19T00:00:03.000Z",
        });
        workflowAdmissionQueue.release("wake-blocker");
        assert.isFalse(yield* Effect.promise(() => activating));
        assert.strictEqual(
          Option.getOrThrow(yield* repo.getById({ runId: row.runId })).status,
          "paused",
        );
      }),
    ),
  );
});

// Type-level guard: the binding glue accepts exactly these handlers.
const _handlersType: T3workWorkflowRunToolHandlers | undefined = undefined;
void _handlersType;
