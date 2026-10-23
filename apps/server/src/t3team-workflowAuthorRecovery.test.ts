// @effect-diagnostics nodeBuiltinImport:off -- inspect the retained draft in an isolated test directory.
import * as NodeFS from "node:fs";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { layerMemory } from "./persistence/Sqlite.ts";
import { WorkflowRunRepository, WorkflowRunRepositoryLive } from "./persistence/WorkflowRuns.ts";
import {
  WorkflowJournalStore,
  WorkflowJournalStoreLive,
} from "./persistence/SqliteJournalStore.ts";
import { startAuthoredWorkflowRun } from "./t3team-workflowAuthorLaunch.ts";
import { workflowAuthorSessionForRun } from "./t3team-workflowAuthorSession.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { buildRunningWorkflowRunRow } from "./t3team-workflowEngineDurability.ts";
import { makeFakeWorkflowHost } from "./t3team-workflowHostFake.fixtures.ts";
import { makeRecipeToolHandlers } from "./t3team-toolBrokerRecipeTools.ts";
import { makeWorkflowResumeToolHandlers } from "./t3team-toolBrokerWorkflowResumeTool.ts";
import { callT3TeamWorkflowResumeTool } from "./t3team-toolBrokerBindingWorkflowResume.ts";
import { makeWorkflowStatusToolHandlers } from "./t3team-toolBrokerWorkflowStatusTool.ts";

const TestLayer = Layer.mergeAll(WorkflowRunRepositoryLive, WorkflowJournalStoreLive).pipe(
  Layer.provideMerge(layerMemory),
  Layer.provideMerge(NodeServices.layer),
);
const threadId = ThreadId.make("author-recovery-thread");
const projectId = ProjectId.make("author-recovery-project");
const modelSelection = createModelSelection(ProviderInstanceId.make("author-provider"), "model");
const nowIso = () => "2026-10-23T00:00:00.000Z";
const intent = { goal: "Calculate a sum", expectedOutcome: "The sum", guardrails: ["Read only"] };

const harness = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({ prefix: "author-recovery-" });
  const runRepository = yield* WorkflowRunRepository;
  const journalStore = yield* WorkflowJournalStore;
  const registry = makeWorkflowEngineRegistry();
  const fake = makeFakeWorkflowHost();
  const deps = {
    fileSystem,
    path,
    runRepository,
    journalStore,
    registry,
    host: fake.host,
    rearmScheduler: async () => {},
    loadThreadProject: () => Effect.succeed({ project: { workspaceRoot } }),
  };
  const row = (runId: string) => ({
    ...buildRunningWorkflowRunRow({
      runId,
      workflowPath: path.join(workspaceRoot, ".t3team-runs", runId, "workflow.ts"),
      args: {},
      launchThreadId: threadId,
      projectId,
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      origin: "ephemeral",
      nowIso: nowIso(),
    }),
    status: "failed" as const,
    failureStep: "launch: workflow.author",
    failureReason: "No validated submission",
  });
  return { deps, workspaceRoot, fake, row };
});

it.effect(
  "rejects pre-journal resume with structured readiness before mutating args or source",
  () =>
    Effect.gen(function* () {
      const { deps, row } = yield* harness;
      const run = row("no-journal");
      yield* deps.runRepository.upsert(run);
      const handlers = makeWorkflowResumeToolHandlers(deps)(threadId);
      const result = yield* handlers.resumeWorkflowRun({
        runId: run.runId,
        args: { changed: true },
        source: "invalid",
      });
      assert.deepInclude(result, {
        ok: false,
        code: "WORKFLOW_NOT_STARTED",
        status: "failed",
        state: { journal: "missing", source: "missing" },
      });
      assert.deepStrictEqual(
        Option.getOrThrow(yield* deps.runRepository.getById({ runId: run.runId })).args,
        {},
      );
      assert.isFalse(NodeFS.existsSync(run.workflowPath));
      const tool = yield* callT3TeamWorkflowResumeTool({
        scopeLabel: "test",
        toolArgs: { runId: run.runId },
        workflowResumeTools: handlers,
      });
      assert.isTrue(tool.isError);
      assert.deepInclude(tool.structuredContent, { ok: false, code: "WORKFLOW_NOT_STARTED" });
      // Even an available source cannot be replayed before the first engine start.
      yield* deps.fileSystem.makeDirectory(deps.path.dirname(run.workflowPath), {
        recursive: true,
      });
      yield* deps.fileSystem.writeFileString(run.workflowPath, "return 1;");
      const available = yield* handlers.resumeWorkflowRun({ runId: run.runId });
      assert.deepInclude(available, {
        ok: false,
        state: { journal: "missing", source: "available" },
      });
    }).pipe(Effect.scoped, Effect.provide(TestLayer)),
);

it.effect.each(["submit", "validate"] as const)(
  "an exhausted author retains %s source and partial output without starting a journal",
  (attempt) =>
    Effect.gen(function* () {
      const { deps, workspaceRoot, fake, row } = yield* harness;
      const runId = `exhausted-author-${attempt}`;
      const candidate = "export const meta = { name: 'unfinished' };\nconst partial =";
      const started = Promise.withResolvers<string>();
      const host = {
        ...fake.host,
        startTurn: async ({ threadId: authorId }: { threadId: string }) => {
          started.resolve(authorId);
        },
      };
      const authoring = yield* startAuthoredWorkflowRun(
        { launch: { ...deps, host }, author: { newId: () => "attempt", nowIso } },
        {
          runId,
          workspaceRoot,
          args: {},
          intent,
          launchThreadId: threadId,
          projectId,
          modelSelection,
          authorModelSelection: modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          onAdmitted: async () => {},
        },
      ).pipe(Effect.forkChild);
      const authorId = yield* Effect.promise(() => started.promise);
      const session = workflowAuthorSessionForRun(runId)!;
      const checked =
        attempt === "submit"
          ? yield* Effect.promise(() => session.submit!(candidate))
          : yield* makeRecipeToolHandlers(deps)(ThreadId.make(authorId)).validateRecipe({
              source: candidate,
            });
      assert.isFalse(checked.ok);
      yield* Effect.promise(() =>
        deps.registry.takePending(authorId)!.resolveLive!("Partial work before token exhaustion"),
      );
      yield* Fiber.join(authoring);
      const run = Option.getOrThrow(yield* deps.runRepository.getById({ runId }));
      assert.strictEqual(run.status, "paused");
      assert.strictEqual(run.failureStep, "authoring.exhausted");
      assert.deepStrictEqual(
        JSON.parse(NodeFS.readFileSync(`${row(runId).workflowPath}.draft.json`, "utf8")),
        {
          source: candidate,
          reply: "Partial work before token exhaustion",
        },
      );
      assert.isFalse(NodeFS.existsSync(run.workflowPath));
      assert.isFalse(yield* Effect.promise(() => deps.journalStore.hasRun(runId)));
      assert.isFalse(
        fake.activities().some((activity) => activity.id === `t3team-wf-step:${runId}:run`),
      );
      const status = yield* makeWorkflowStatusToolHandlers(deps)(threadId).getStatus({ runId });
      assert.deepInclude(status, {
        status: "paused",
        authoring: {
          state: "exhausted_with_draft",
          draftPath: `${run.workflowPath}.draft.json`,
          action: "re-author",
          replaceRunId: runId,
        },
      });
    }).pipe(Effect.scoped, Effect.provide(TestLayer)),
);

it.effect("status distinguishes authoring recovery from execution journal resume", () =>
  Effect.gen(function* () {
    const { deps, row } = yield* harness;
    const preStart = row("pre-start");
    yield* deps.runRepository.upsert(preStart);
    const execution = {
      ...row("execution"),
      failureStep: "resume: tool.call",
      failureReason: "Tool unavailable",
    };
    yield* deps.runRepository.upsert(execution);
    yield* deps.fileSystem.makeDirectory(deps.path.dirname(execution.workflowPath), {
      recursive: true,
    });
    yield* deps.fileSystem.writeFileString(execution.workflowPath, "return 1;");
    yield* Effect.promise(() =>
      deps.journalStore.writeRunMeta(execution.runId, {
        workflowPath: execution.workflowPath,
        argsHash: execution.argsHash,
        createdAt: nowIso(),
      }),
    );
    const status = makeWorkflowStatusToolHandlers(deps)(threadId);
    const before = yield* status.getStatus({ runId: preStart.runId });
    const after = yield* status.getStatus({ runId: execution.runId });
    assert.isTrue("hint" in before && before.hint.includes("Re-author"));
    assert.isTrue("hint" in after && after.hint.includes("resume (keeps the executed prefix)"));
  }).pipe(Effect.scoped, Effect.provide(TestLayer)),
);
