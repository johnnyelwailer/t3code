// @effect-diagnostics nodeBuiltinImport:off - test asserts persisted run files on local disk.
/**
 * `t3team.orchestration.run` — handler-level acceptance against the REAL durable engine seams: an
 * in-memory SQLite run repo + journal store, the real launch funnel, the real author session /
 * turn machinery, and a captured orchestration dispatch standing in for the live engine. The test
 * plays the AUTHOR: it answers the captured author turn by calling the same broker handler from the
 * author thread (a submission), then ends the turn through the registry's pending ask — exactly the
 * path the reactor takes when the provider's final message lands.
 */

import * as NodeFS from "node:fs";
import * as NodeTimersPromises from "node:timers/promises";

import { assert, describe, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  type OrchestrationCommand,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  ThreadId,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as DateTime from "effect/DateTime";
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
import type { T3TeamTurnToolContext } from "./t3team-toolBroker.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import {
  buildRunningWorkflowRunRow,
  makeWorkflowRunLifecycle,
} from "./t3team-workflowEngineDurability.ts";
import { callT3TeamWorkflowRunTool } from "./t3team-toolBrokerBindingWorkflowRun.ts";
import {
  makeWorkflowRunToolHandlers,
  recentActiveLaunchBlocker,
  type T3TeamWorkflowRunToolHandlers,
} from "./t3team-toolBrokerWorkflowRunTools.ts";
import { WORKFLOW_AUTHOR_TOOL_IDS } from "./t3team-workflowAuthorTurn.ts";
import { resetWorkflowAuthorSessions } from "./t3team-workflowAuthorSession.ts";
import { workflowAdmissionQueue } from "./t3team-workflowAdmissionQueue.ts";
import { setWorkflowEphemeralConcurrencyPolicy } from "./t3team-workflowEphemeralConcurrencyPolicy.ts";

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

/** The incident shape: a name imported from the engine API that the runtime never binds. */
const UNBOUND_IMPORT_SOURCE = `
import { Schema } from "effect";
import { defineModelX } from "@t3team/sdk";
export const Inputs = Schema.Struct({ a: Schema.Number, b: Schema.Number });
export const meta = { name: "temp.sum", inputs: Inputs } as const;
export default async function run() {
  return defineModelX({ provider: "x", id: "y" });
}
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
  status: "completed" | "suspended" | "failed",
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const row = yield* repo.getById({ runId });
    if (Option.isSome(row) && row.value.status === status) return row.value;
    // Detached workflow fibers run on the live runtime. Poll with a real timer rather than the
    // @effect/vitest virtual clock, which does not advance while this test waits.
    yield* Effect.promise(() => NodeTimersPromises.setTimeout(10));
  }
  return yield* Effect.fail(`workflow ${runId} did not reach ${status}`);
});

/** The author's turn is dispatched by the detached authoring fiber; wait for its pending ask. */
const waitForAuthorTurn = Effect.fn("waitForAuthorTurn")(function* (
  registry: ReturnType<typeof makeWorkflowEngineRegistry>,
  authorThreadId: string,
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (registry.peekPending(authorThreadId) !== undefined) return;
    yield* Effect.promise(() => NodeTimersPromises.setTimeout(10));
  }
  return yield* Effect.fail(`author turn for ${authorThreadId} was never dispatched`);
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
let harnessCount = 0;
const makeProvider = (
  instanceId: string,
  driver: string,
  modelSlugs: ReadonlyArray<string>,
  isDefault = false,
): ServerProvider =>
  ({
    instanceId,
    driver: ProviderDriverKind.make(driver),
    enabled: true,
    installed: true,
    models: modelSlugs.map((slug) => ({
      slug,
      name: slug,
      isCustom: false,
      isDefault,
      capabilities: null,
    })),
  }) as unknown as ServerProvider;

const makeHarness = Effect.fn("makeHarness")(function* (
  options: {
    readonly authorTurnTimeoutMs?: number;
    readonly providers?: ReadonlyArray<ServerProvider>;
  } = {},
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const repo = yield* WorkflowRunRepository;
  const store = yield* WorkflowJournalStore;
  const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({
    prefix: "t3team-ephemeral-run-",
  });
  const dispatched: OrchestrationCommand[] = [];
  const toolContexts = new Map<string, T3TeamTurnToolContext | null | undefined>();
  const registry = makeWorkflowEngineRegistry();
  resetWorkflowAuthorSessions();
  harnessCount += 1;
  const harnessThreadId = ThreadId.make(`${threadId}-${harnessCount}`);
  const factory = makeWorkflowRunToolHandlers({
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
    contextStore: {
      put: ({ threadId: id, toolContext }) =>
        Effect.sync(() => void toolContexts.set(id, toolContext)),
    },
    ...(options.authorTurnTimeoutMs === undefined
      ? {}
      : { authorTurnTimeoutMs: options.authorTurnTimeoutMs }),
    ...(options.providers === undefined
      ? {}
      : { listProviders: () => Effect.succeed(options.providers!) }),
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
    // Each harness is its own launch thread: the in-memory DB is shared across the file, and the
    // one-launch-per-turn guard (GHE #415) would otherwise see an earlier test's still-suspended
    // run as this thread's own.
  });
  const handlers = factory(harnessThreadId);
  /** Play the author: submit `source` from the author thread (the same broker handler). */
  const authorSubmits = (runId: string, source: string) =>
    factory(ThreadId.make(`${runId}:author`)).runWorkflow({ source, intent });
  const endAuthorTurn = (runId: string, reply: string) =>
    Effect.promise(async () => {
      const pending = registry.takePending(`${runId}:author`);
      assert.isDefined(pending?.resolveLive, "the author turn must be parked on the registry");
      await pending!.resolveLive!(reply);
    });
  const authorArchives = (runId: string) =>
    dispatched.filter(
      (command) => command.type === "thread.archive" && command.threadId === `${runId}:author`,
    );
  const failureNotices = (runId: string) =>
    dispatched.filter(
      (command) =>
        command.type === "thread.message.upsert" &&
        command.message.messageId === `t3team-wf-result:${runId}` &&
        command.message.text.includes("⚠️"),
    );
  return {
    handlers,
    factory,
    authorSubmits,
    endAuthorTurn,
    failureNotices,
    authorArchives,
    toolContexts,
    dispatched,
    workspaceRoot,
    repo,
    registry,
    threadId: harnessThreadId,
  };
});

testLayer("t3team.orchestration.run — authored ephemeral orchestrations", (it) => {
  it.effect("returns an explicit workflow-UI handoff through the broker result", () =>
    Effect.gen(function* () {
      const result = yield* callT3TeamWorkflowRunTool({
        scopeLabel: "for this thread.",
        toolArgs: { intent },
        workflowRunTools: {
          runWorkflow: () =>
            Effect.succeed({
              ok: true as const,
              runId: "run-handoff",
              status: "authoring" as const,
              handoff: "workflow-ui" as const,
            }),
        },
      });

      assert.deepInclude(result.structuredContent, {
        status: "authoring",
        handoff: "workflow-ui",
      });
      assert.include(result.content[0]?.text ?? "", '"handoff": "workflow-ui"');
    }),
  );

  it.effect("rejects BOTH source and workflowPath, source WITHOUT intent, and a blank intent", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { handlers } = yield* makeHarness();
        const call = (toolArgs: unknown) =>
          callT3TeamWorkflowRunTool({
            scopeLabel: "for this thread.",
            toolArgs,
            workflowRunTools: handlers,
          });
        const errorText = (result: { readonly structuredContent?: unknown }) =>
          String((result.structuredContent as { readonly error?: unknown } | undefined)?.error);

        const both = yield* call({ source: "return 1;", workflowPath: "x.workflow.ts", intent });
        assert.isTrue(both.isError);
        assert.include(errorText(both), "at most one");

        // `source` is supported but never a substitute for the contract: intent stays required.
        const sourceOnly = yield* call({ source: PURE_SUM_SOURCE });
        assert.isTrue(sourceOnly.isError);
        assert.include(errorText(sourceOnly).toLowerCase(), "intent");

        const blankGoal = yield* call({ intent: { ...intent, goal: "  " } });
        assert.isTrue(blankGoal.isError);
        assert.include(errorText(blankGoal), "nonblank intent.goal");

        const blankGuardrail = yield* call({ intent: { ...intent, guardrails: [" "] } });
        assert.isTrue(blankGuardrail.isError);
        assert.include(errorText(blankGuardrail), "nonblank guardrail");
      }),
    ),
  );

  it.effect(
    "intent-only: the author's fixable first draft never reaches the caller; the second draft launches and completes",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const h = yield* makeHarness();
          const result = yield* h.handlers.runWorkflow({ args: { a: 2, b: 40 }, intent });
          assert.strictEqual(result.status, "authoring");
          assert.strictEqual(result.handoff, "workflow-ui");
          const { runId } = result;
          const authorThreadId = `${runId}:author`;
          yield* waitForAuthorTurn(h.registry, authorThreadId);

          // A hidden, ephemeral author thread scoped to exactly its three tools.
          const created = h.dispatched.find(
            (command) => command.type === "thread.create" && command.threadId === authorThreadId,
          );
          assert.isDefined(created);
          if (created?.type === "thread.create") {
            assert.strictEqual(created.retention, "ephemeral");
            // The caller's thread is full-access / default. The author never inherits that.
            assert.strictEqual(created.interactionMode, "plan");
            assert.strictEqual(created.runtimeMode, "approval-required");
          }
          const kickoff = h.dispatched.find(
            (command) =>
              command.type === "thread.turn.start" && command.threadId === authorThreadId,
          );
          if (kickoff?.type === "thread.turn.start") {
            assert.strictEqual(kickoff.interactionMode, "plan");
            assert.strictEqual(kickoff.runtimeMode, "approval-required");
          }
          // The card's "Authoring" step carries NO thread id: the author is not openable.
          const authorStep = h.dispatched.find(
            (command) =>
              command.type === "thread.activity.append" &&
              command.activity.id === `t3team-wf-step:${runId}:author`,
          );
          if (authorStep?.type === "thread.activity.append") {
            assert.isUndefined((authorStep.activity.payload as { threadId?: string }).threadId);
          }
          assert.deepStrictEqual(
            h.toolContexts.get(authorThreadId)?.tools.map((tool) => tool.id),
            [...WORKFLOW_AUTHOR_TOOL_IDS],
          );
          // The run already exists for the caller: an AUTHORING row (its own status, so a boot
          // can never launch it without source) and a plan card in its thread.
          assert.strictEqual(
            Option.getOrThrow(yield* h.repo.getById({ runId })).status,
            "authoring",
          );
          assert.isTrue(
            h.dispatched.some(
              (command) =>
                command.type === "thread.message.upsert" &&
                command.message.messageId === `t3team-wf-shape:${runId}`,
            ),
          );

          // First draft: the incident's unbound import. The verdict is a TOOL RESULT for the author.
          const first = yield* h.authorSubmits(runId, UNBOUND_IMPORT_SOURCE).pipe(Effect.result);
          assert.strictEqual(first._tag, "Failure");
          if (first._tag === "Failure") {
            assert.include(first.failure, "defineModelX");
            assert.include(first.failure, "ReferenceError");
          }
          // Second draft launches the SAME run.
          const second = yield* h.authorSubmits(runId, PURE_SUM_SOURCE);
          assert.strictEqual(second.status, "accepted");
          assert.strictEqual(second.runId, runId);
          yield* h.endAuthorTurn(runId, "Launched.");

          const row = yield* waitForRunStatus(h.repo, runId, "completed");
          assert.strictEqual(row.origin, "ephemeral");
          assert.isTrue(NodeFS.existsSync(`${h.workspaceRoot}/.t3team-runs/${runId}/workflow.ts`));
          // Nothing fixable ever reached the caller's thread.
          assert.deepStrictEqual(h.failureNotices(runId), []);
          const authorSteps = h.dispatched.filter(
            (command) =>
              command.type === "thread.activity.append" &&
              command.activity.id === `t3team-wf-step:${runId}:author`,
          );
          assert.isAtLeast(authorSteps.length, 2);
          // A completed run has no repairs left to ask for: its author thread is retired.
          assert.strictEqual(h.authorArchives(runId).length, 1);
        }),
      ),
  );

  it.effect("unfixable: the author declines → the run fails and the caller gets ONE notice", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const h = yield* makeHarness();
        const result = yield* h.handlers.runWorkflow({ intent });
        assert.strictEqual(result.status, "authoring");
        const { runId } = result;
        yield* waitForAuthorTurn(h.registry, `${runId}:author`);
        yield* h.endAuthorTurn(runId, "This intent needs file writes the guardrails forbid.");

        const row = yield* waitForRunStatus(h.repo, runId, "failed");
        assert.strictEqual(row.status, "failed");
        const notices = h.failureNotices(runId);
        assert.strictEqual(notices.length, 1);
        if (notices[0]?.type === "thread.message.upsert") {
          assert.strictEqual(notices[0].threadId, h.threadId);
          assert.include(notices[0].message.text, "cannot continue");
          assert.include(notices[0].message.text, "guardrails forbid");
        }
        // A late submission has nobody waiting for it.
        const late = yield* h.authorSubmits(runId, PURE_SUM_SOURCE).pipe(Effect.result);
        assert.strictEqual(late._tag, "Failure");
        assert.strictEqual(h.authorArchives(runId).length, 1);
      }),
    ),
  );

  it.effect(
    "author timeout: the turn is interrupted, the run fails once, the author is retired",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const h = yield* makeHarness({ authorTurnTimeoutMs: 50 });
          const result = yield* h.handlers.runWorkflow({ intent });
          const { runId } = result;
          yield* waitForAuthorTurn(h.registry, `${runId}:author`);
          const row = yield* waitForRunStatus(h.repo, runId, "failed");
          assert.strictEqual(row.status, "failed");
          assert.isTrue(
            h.dispatched.some(
              (command) =>
                command.type === "thread.turn.interrupt" && command.threadId === `${runId}:author`,
            ),
            "the provider keeps spending unless the turn is interrupted",
          );
          const notices = h.failureNotices(runId);
          assert.strictEqual(notices.length, 1);
          if (notices[0]?.type === "thread.message.upsert") {
            assert.include(notices[0].message.text, "did not finish");
          }
          assert.isUndefined(h.registry.peekPending(`${runId}:author`));
          assert.strictEqual(h.authorArchives(runId).length, 1);
        }),
      ),
  );

  it.effect(
    "a caller-supplied source is a DRAFT: it reaches the author and goes through the same loop",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const h = yield* makeHarness();
          const result = yield* h.handlers.runWorkflow({
            source: ASK_USER_SOURCE,
            args: { question: "Ship it?" },
            intent,
          });
          assert.strictEqual(result.status, "authoring");
          const { runId } = result;
          yield* waitForAuthorTurn(h.registry, `${runId}:author`);
          const kickoff = h.dispatched.find(
            (command) =>
              command.type === "thread.turn.start" && command.threadId === `${runId}:author`,
          );
          assert.isDefined(kickoff);
          if (kickoff?.type === "thread.turn.start") {
            assert.include(kickoff.message.text, "temp.approval");
            assert.include(kickoff.message.text, intent.goal);
          }
          const launched = yield* h.authorSubmits(runId, ASK_USER_SOURCE);
          assert.strictEqual(launched.status, "accepted");
          yield* h.endAuthorTurn(runId, "Launched.");

          // The launched run parks on the CALLER's thread with its decision card, as before.
          const row = yield* waitForRunStatus(h.repo, runId, "suspended");
          assert.strictEqual(row.launchThreadId, h.threadId);
          assert.strictEqual(row.pendingThreadId, h.threadId);
          assert.strictEqual(row.pendingKind, "user.input");
          assert.deepStrictEqual(h.failureNotices(runId), []);
        }),
      ),
  );

  it.effect("an authoring run already counts for the one-launch-per-turn rule", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const h = yield* makeHarness();
        const first = yield* h.handlers.runWorkflow({ intent });
        yield* waitForAuthorTurn(h.registry, `${first.runId}:author`);
        const second = yield* h.handlers.runWorkflow({ intent }).pipe(Effect.result);
        assert.strictEqual(second._tag, "Failure");
        if (second._tag === "Failure") assert.include(second.failure, first.runId);
        yield* h.endAuthorTurn(first.runId, "declined");
        yield* waitForRunStatus(h.repo, first.runId, "failed");
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
    "a saved workflowPath launches directly: accepted immediately, durably queued until FIFO capacity is free",
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
          NodeFS.writeFileSync(`${workspaceRoot}/sum.workflow.ts`, PURE_SUM_SOURCE);

          const result = yield* handlers.runWorkflow({
            workflowPath: "sum.workflow.ts",
            args: { a: 2, b: 3 },
            intent,
          });
          assert.strictEqual(result.status, "accepted");
          assert.isTrue(
            NodeFS.existsSync(`${workspaceRoot}/.t3team-runs/${result.runId}/workflow.ts`),
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

  it.effect(
    "refuses a second launch when this thread's authoring run is older than every other recent update",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const h = yield* makeHarness();
          const stale = "2020-01-01T00:00:00.000Z";
          yield* h.repo.upsert({
            ...buildRunningWorkflowRunRow({
              runId: "authoring-stale",
              workflowPath: `${h.workspaceRoot}/stale.workflow.ts`,
              args: {},
              launchThreadId: h.threadId,
              projectId,
              modelSelection,
              runtimeMode: "full-access",
              interactionMode: "default",
              origin: "ephemeral",
              nowIso: stale,
            }),
            status: "authoring",
          });
          for (let index = 0; index < 30; index += 1) {
            const stamp = `2026-02-01T00:00:${String(index).padStart(2, "0")}.000Z`;
            yield* h.repo.upsert(
              buildRunningWorkflowRunRow({
                runId: `other-${index}`,
                workflowPath: `${h.workspaceRoot}/other-${index}.workflow.ts`,
                args: {},
                launchThreadId: `other-thread-${index}`,
                projectId,
                modelSelection,
                runtimeMode: "full-access",
                interactionMode: "default",
                origin: "ephemeral",
                nowIso: stamp,
              }),
            );
          }
          const second = yield* h.handlers.runWorkflow({ intent }).pipe(Effect.result);
          assert.strictEqual(second._tag, "Failure");
          if (second._tag === "Failure") {
            assert.include(second.failure, "authoring-stale");
            assert.include(second.failure, "authoring");
          }
        }),
      ),
  );

  it.effect("never chooses an unrestrictable driver for the author", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const only = makeProvider("inst-1", "custom-driver", ["model-x"], true);
        const h = yield* makeHarness({ providers: [only] });
        const refused = yield* h.handlers.runWorkflow({ intent }).pipe(Effect.result);
        assert.strictEqual(refused._tag, "Failure");
        if (refused._tag === "Failure") {
          assert.include(refused.failure, "custom-driver");
          assert.include(refused.failure, "Cannot author");
        }

        const relocated = yield* makeHarness({
          providers: [only, makeProvider("codex-safe", "codex", ["gpt"], true)],
        });
        const started = yield* relocated.handlers.runWorkflow({ intent });
        assert.strictEqual(started.status, "authoring");
        const created = relocated.dispatched.find(
          (command) =>
            command.type === "thread.create" && command.threadId === `${started.runId}:author`,
        );
        assert.isTrue(created?.type === "thread.create");
        if (created?.type === "thread.create") {
          assert.strictEqual(String(created.modelSelection.instanceId), "codex-safe");
          assert.strictEqual(created.runtimeMode, "approval-required");
        }
        const step = relocated.dispatched.find(
          (command) =>
            command.type === "thread.activity.append" &&
            command.activity.id === `t3team-wf-step:${started.runId}:author`,
        );
        assert.isTrue(step?.type === "thread.activity.append");
        if (step?.type === "thread.activity.append") {
          const detail = (step.activity.payload as { detail?: string }).detail ?? "";
          assert.include(detail, "codex-safe");
          assert.include(detail, "inst-1");
        }
      }),
    ),
  );
});

// Type-level guard: the binding glue accepts exactly these handlers.
const _handlersType: T3TeamWorkflowRunToolHandlers | undefined = undefined;
void _handlersType;

// GHE #415: one agent turn launched 87 runs because nothing enforced "a handoff ends the turn".
// Review of fork #349: the verdict keys on the run's LIVE STATE, never on how long ago it was
// launched — authoring can outlast any window, and after one a copy slipped through.
describe("recentActiveLaunchBlocker", () => {
  const now = Date.parse("2026-09-03T15:00:00.000Z");
  const HOUR = 3600;
  const row = (runId: string, status: string, ageSeconds: number, launchThreadId = "thread-1") => ({
    runId,
    launchThreadId,
    status,
    createdAt: DateTime.formatIso(DateTime.makeUnsafe(now - ageSeconds * 1000)),
  });

  it("refuses while a run from this thread is authoring, queued, running or suspended — however old", () => {
    for (const status of ["authoring", "queued", "running", "suspended"]) {
      const verdict = recentActiveLaunchBlocker([row("run-a", status, 6 * HOUR)], {
        threadId: "thread-1",
        nowMs: now,
      });
      assert.strictEqual(verdict.kind, "refuse", status);
      if (verdict.kind === "refuse") {
        assert.include(verdict.message, "run-a");
        assert.include(verdict.message, "replaceRunId");
      }
    }
  });

  it("allows a launch when this thread's runs are parked, terminal, or another thread's", () => {
    const rows = [
      row("run-sleeping", "sleeping", 5),
      row("run-watching", "watching", 5),
      row("run-paused", "paused", 5),
      row("run-done", "completed", 5),
      row("run-failed", "failed", 5),
      row("run-cancelled", "cancelled", 5),
      row("run-other", "running", 5, "thread-2"),
    ];
    assert.deepStrictEqual(recentActiveLaunchBlocker(rows, { threadId: "thread-1", nowMs: now }), {
      kind: "ok",
    });
  });

  it("replaces the named non-terminal run instead of refusing — also past any window", () => {
    const verdict = recentActiveLaunchBlocker([row("run-a", "authoring", 6 * HOUR)], {
      threadId: "thread-1",
      nowMs: now,
      replaceRunId: "run-a",
    });
    assert.deepStrictEqual(verdict, { kind: "replace", runId: "run-a" });
    assert.deepStrictEqual(
      recentActiveLaunchBlocker([row("run-s", "sleeping", 5)], {
        threadId: "thread-1",
        nowMs: now,
        replaceRunId: "run-s",
      }),
      { kind: "replace", runId: "run-s" },
    );
    assert.deepStrictEqual(
      recentActiveLaunchBlocker([row("run-d", "completed", 5)], {
        threadId: "thread-1",
        nowMs: now,
        replaceRunId: "run-d",
      }),
      { kind: "ok" },
    );
  });
});
