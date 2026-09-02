/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- mirrors t3team-toolBrokerWorkflowResumeTool.test.ts: a real-engine integration test bridging the Effect runtime. */
// @effect-diagnostics nodeBuiltinImport:off - integration test writes an ephemeral workflow source + temp dir.
/**
 * A failed run must say WHY — round trip, real engine + real SQLite.
 *
 * `t3team_orchestration_status` / `_resume` used to return a bare status, so an agent (or the
 * self-heal path) had to read the journal to learn the cause. The reason is now written by the
 * ONE terminal-failure funnel into `workflow_runs.failure_reason` / `.failure_step`
 * (migration 044) and echoed by both tools.
 *
 * Covered here:
 *   • a real launch that throws persists a SANITIZED reason — no stack frames, no host paths;
 *   • `status` returns it as additive fields and folds it into its hint;
 *   • `resume` of that failed run echoes it back;
 *   • a later successful settle CLEARS it, so no stale reason survives a repair;
 *   • the sanitizer itself, unit level.
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";
import { afterAll, describe, expect, it as vitestIt } from "vite-plus/test";

import { ServerConfig } from "./config.ts";
import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { WorkflowJournalStoreLive } from "./persistence/Layers/SqliteJournalStore.ts";
import { WorkflowRunRepositoryLive } from "./persistence/Layers/WorkflowRuns.ts";
import { WorkflowJournalStore } from "./persistence/Services/WorkflowJournalStore.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import type { WorkflowResumeToolDeps } from "./t3team-toolBrokerWorkflowResumeActions.ts";
import { makeWorkflowResumeToolHandlers } from "./t3team-toolBrokerWorkflowResumeTool.ts";
import { makeWorkflowStatusToolHandlers } from "./t3team-toolBrokerWorkflowStatusTool.ts";
import {
  buildRunningWorkflowRunRow,
  makeWorkflowRunLifecycle,
} from "./t3team-workflowEngineDurability.ts";
import { launchWorkflowRecipe } from "./t3team-workflowEngineLaunch.ts";
import {
  makeWorkflowEngineRegistry,
  T3TeamWorkflowEngineRegistry,
  T3TeamWorkflowEngineRegistryLive,
} from "./t3team-workflowEngineRegistry.ts";
import {
  userFacingFailureStep,
  workflowFailureReasonText,
  workflowFailureStepText,
} from "./t3team-workflowFailureReason.ts";
import {
  T3TeamWorkflowScheduler,
  T3TeamWorkflowSchedulerLive,
} from "./t3team-workflowScheduler.ts";

const cwd = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-failure-reason-"));
afterAll(() => NodeFS.rmSync(cwd, { recursive: true, force: true }));

const projectId = ProjectId.make("proj-failure-reason");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const threadId = ThreadId.make("failure-reason-thread");
const nowIso = (): string => "2026-07-20T00:00:00.000Z";

const stubEngine: OrchestrationEngineShape = {
  readEvents: () => Stream.empty,
  dispatch: () => Effect.succeed({ sequence: 0 }),
  streamDomainEvents: Stream.never,
  // Required by OrchestrationEngineShape since main's sidebar/turn work; this stub never
  // dispatches, so the latest sequence is simply 0.
  latestSequence: Effect.succeed(0),
};

const TestLayer = Layer.mergeAll(
  T3TeamWorkflowSchedulerLive.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        T3TeamWorkflowEngineRegistryLive,
        WorkflowRunRepositoryLive,
        WorkflowJournalStoreLive,
      ),
    ),
    Layer.provide(SqlitePersistenceMemory),
  ),
  Layer.succeed(OrchestrationEngineService, stubEngine),
  ServerConfig.layerTest(cwd, { prefix: "t3-failure-reason-test-" }),
).pipe(Layer.provideMerge(NodeServices.layer));

const makeResumeHandlers = Effect.gen(function* () {
  const scheduler = yield* T3TeamWorkflowScheduler;
  const deps: WorkflowResumeToolDeps = {
    fileSystem: yield* FileSystem.FileSystem,
    path: yield* Path.Path,
    runRepository: yield* WorkflowRunRepository,
    registry: yield* T3TeamWorkflowEngineRegistry,
    journalStore: yield* WorkflowJournalStore,
    rearmScheduler: () => scheduler.rearm(),
    dispatch: () => Promise.resolve(),
    loadThreadProject: () => Effect.succeed({ project: { workspaceRoot: cwd } }),
  };
  return makeWorkflowResumeToolHandlers(deps)(threadId);
});

// The message deliberately carries a stack frame AND an absolute host path — neither may reach
// the agent-facing reason.
const failingSource = `import { Schema } from "effect";
export const Inputs = Schema.Struct({});
export const Outputs = Schema.Struct({ stamp: Schema.Number });
export const meta = { name: "failure-reason.fixture", inputs: Inputs, outputs: Outputs } as const;
const stamp = Date.now();
throw new Error("could not read /Users/someone/private/workspace/config.json\\n    at body (/tmp/x.ts:6:7)");
`;

const correctedSource = `import { Schema } from "effect";
export const Inputs = Schema.Struct({});
export const Outputs = Schema.Struct({ stamp: Schema.Number });
export const meta = { name: "failure-reason.fixture", inputs: Inputs, outputs: Outputs } as const;
const stamp = Date.now();
return { stamp };
`;

it.live("a failed run reports WHY on status and resume, and the reason clears on repair", () =>
  Effect.gen(function* () {
    const repo = yield* WorkflowRunRepository;
    const store = yield* WorkflowJournalStore;
    const resumeHandlers = yield* makeResumeHandlers;
    const statusHandlers = makeWorkflowStatusToolHandlers({ runRepository: repo })(threadId);

    const runId = "failure-reason-run";
    const runDir = NodePath.join(cwd, ".t3team-runs", runId);
    const workflowPath = NodePath.join(runDir, "workflow.ts");
    NodeFS.mkdirSync(runDir, { recursive: true });
    NodeFS.writeFileSync(workflowPath, failingSource);

    const row = buildRunningWorkflowRunRow({
      runId,
      workflowPath,
      args: {},
      launchThreadId: String(threadId),
      projectId,
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      origin: "ephemeral",
      nowIso: nowIso(),
    });
    let seq = 0;
    const launched = yield* Effect.promise(() =>
      launchWorkflowRecipe({
        runId,
        workflowPath,
        args: {},
        runsRoot: NodePath.join(cwd, ".t3team-runs"),
        launchThreadId: String(threadId),
        projectId,
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        registry: makeWorkflowEngineRegistry(),
        dispatch: () => Promise.resolve(),
        newId: () => `id-${(seq += 1)}`,
        nowIso,
        store,
        lifecycle: makeWorkflowRunLifecycle({ repo, row, nowIso }),
      }),
    );
    assert.strictEqual(launched.status, "failed");

    // 1. Persisted at settle time, sanitized.
    const failedRow = Option.getOrThrow(yield* repo.getById({ runId }));
    assert.strictEqual(failedRow.status, "failed");
    assert.strictEqual(failedRow.failureReason, "could not read config.json");
    assert.strictEqual(failedRow.failureStep, "launch");

    // 2. `status` surfaces it additively and folds it into the hint.
    const status = yield* statusHandlers.getStatus({ runId });
    assert.ok("failureReason" in status);
    assert.strictEqual(status.failureReason, "could not read config.json");
    assert.strictEqual(status.failureStep, "launch");
    assert.match(status.hint, /failed in launch: could not read config\.json/);

    // 3. `resume` echoes the recorded cause back to a caller that never asked for status.
    const resumed = yield* resumeHandlers.resumeWorkflowRun({ runId, source: correctedSource });
    assert.strictEqual(resumed.status, "accepted");
    assert.strictEqual(resumed.failureReason, "could not read config.json");
    assert.strictEqual(resumed.failureStep, "launch");

    // 4. The repaired run completes and the stale reason is cleared, not left behind.
    yield* Effect.gen(function* () {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const current = Option.getOrThrow(yield* repo.getById({ runId }));
        if (current.status === "completed") {
          assert.strictEqual(current.failureReason ?? null, null);
          assert.strictEqual(current.failureStep ?? null, null);
          return;
        }
        yield* Effect.sleep(Duration.millis(25));
      }
      return yield* Effect.die(new Error("timed out waiting for the repaired run to complete"));
    });
  }).pipe(Effect.provide(TestLayer)),
);

describe("workflowFailureReasonText / workflowFailureStepText", () => {
  vitestIt(
    "drops stack frames, reduces absolute paths, collapses whitespace and caps length",
    () => {
      expect(
        workflowFailureReasonText(
          new Error("boom\n    at fn (/a/b/c.ts:1:1)\n    at g (/d/e.ts:2:2)"),
        ),
      ).toBe("boom");
      expect(workflowFailureReasonText(new Error("cannot open /Users/x/y/secrets.json"))).toBe(
        "cannot open secrets.json",
      );
      expect(workflowFailureReasonText(new Error("a\n\tb   c"))).toBe("a b c");
      expect(workflowFailureReasonText("plain string failure")).toBe("plain string failure");
      expect(workflowFailureReasonText(new Error(""))).toBe(
        "The run failed without reporting a reason.",
      );
      const long = workflowFailureReasonText(new Error("x".repeat(400)));
      expect(long.length).toBe(240);
      expect(long.endsWith("…")).toBe(true);
    },
  );

  vitestIt(
    "labels the failing step with the phase, plus the primitive in flight when known",
    () => {
      expect(workflowFailureStepText("resume", undefined)).toBe("resume");
      expect(workflowFailureStepText("rehydration", "  ")).toBe("rehydration");
      expect(workflowFailureStepText("launch", "thread.turn (Summarize\nthe backlog)")).toBe(
        "launch: thread.turn (Summarize the backlog)",
      );
    },
  );
});

describe("userFacingFailureStep", () => {
  vitestIt("strips the leading internal settle-phase token for a human-facing string", () => {
    expect(userFacingFailureStep("resume: thread.turn (QA round 1)")).toBe(
      "thread.turn (QA round 1)",
    );
  });

  vitestIt("leaves a string with no phase prefix unchanged", () => {
    expect(userFacingFailureStep("thread.turn (QA round 1)")).toBe("thread.turn (QA round 1)");
  });
});
