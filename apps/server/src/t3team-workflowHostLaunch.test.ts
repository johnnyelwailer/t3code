import { assert, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  ProjectId,
  T3TEAM_LAUNCHED_BY_FACT_KEY,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as Orchestrator from "./orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "./orchestration-v2/ProjectionStore.ts";
import * as ThreadManagementService from "./orchestration-v2/ThreadManagementService.ts";
import * as ThreadArtifactsStore from "./t3team-v2/t3team-threadArtifactsStore.ts";
import * as ThreadFactsStore from "./t3team-v2/t3team-threadFactsStore.ts";
import { T3TeamThreadFactsStore } from "./t3team-v2/t3team-threadFactsStore.ts";
import {
  createTestThread,
  makeT3TeamV2TestLayer,
  testModelSelection,
} from "./t3team-v2/t3team-v2Orchestrator.testkit.ts";
import { FAKE_LAUNCH_WORKTREE, makeThreadLaunchFake } from "./t3team-threadLaunchFake.fixtures.ts";
import * as WorkflowHost from "./t3team-workflowHost.ts";
import { launchedThreadIdentity } from "./t3team-workflowLaunchedThreadIds.ts";

const { layer: ThreadLaunchFake, launches } = makeThreadLaunchFake();

const base = makeT3TeamV2TestLayer("t3team-workflow-host-launch");
const services = Layer.mergeAll(
  ThreadManagementService.layer,
  ThreadArtifactsStore.layer,
  ThreadFactsStore.layer,
).pipe(Layer.provideMerge(base));
const TestLayer = WorkflowHost.layer.pipe(
  Layer.provideMerge(ThreadLaunchFake),
  Layer.provideMerge(services),
);

const projectId = ProjectId.make("project:t3team-v2");
const home = ThreadId.make("thread:recipe-home");
const owner = { runId: "run-1", projectId, scope: "recipe:pr-watch" };
const key = "pr:github.com/acme/app#7";
const url = "https://github.com/acme/app/pull/7";
const launchInput = {
  ...owner,
  key,
  launchThreadId: home,
  title: "#7 Fix the thing",
  message: "You watch one PR.",
  modelSelection: testModelSelection,
  runtimeMode: "approval-required" as const,
  interactionMode: "default" as const,
  workspace: { type: "worktree" as const, baseRef: "fix", branch: "fix", startFromOrigin: true },
};

const ok = <T>(answer: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!answer.ok) throw new Error(answer.error);
  return answer.value;
};

it.layer(TestLayer)("workflow host launchThread", (it) => {
  it.effect("launches one top-level thread per key and records who launched it", () =>
    Effect.gen(function* () {
      const host = yield* WorkflowHost.T3TeamWorkflowHost;
      const threads = yield* ThreadManagementService.ThreadManagementService;
      const facts = yield* T3TeamThreadFactsStore;
      yield* createTestThread(home, "Watch my PRs");
      launches.length = 0;

      const first = ok(yield* host.launchThread(launchInput));
      assert.strictEqual(first.threadId, launchedThreadIdentity({ ...owner, key }).threadId);
      assert.isTrue(first.created);
      const again = ok(yield* host.launchThread({ ...launchInput, runId: "run-2", title: "x" }));
      assert.deepStrictEqual(again, { threadId: first.threadId, created: false });
      assert.strictEqual(launches.length, 1, "a known key never launches twice");
      assert.strictEqual(launches[0]?.initialMessage?.text, "You watch one PR.");
      assert.strictEqual(
        launches[0]?.commandId,
        launchedThreadIdentity({ ...owner, key }).commandId,
      );

      const shell = yield* threads.getThreadShell(ThreadId.make(first.threadId));
      // Top-level, in its own worktree, within the run's modes.
      assert.isNull(shell?.lineage.parentThreadId ?? null);
      assert.strictEqual(shell?.worktreePath, FAKE_LAUNCH_WORKTREE);
      assert.strictEqual(shell?.runtimeMode, "approval-required");
      const launchedBy = (yield* facts.get(ThreadId.make(first.threadId)))?.extensions?.[
        T3TEAM_LAUNCHED_BY_FACT_KEY
      ];
      assert.deepInclude(launchedBy as object, {
        runId: "run-2",
        launchThreadId: home,
        scope: "recipe:pr-watch",
        key,
      });

      // Another recipe's same key is another thread.
      const other = ok(yield* host.launchThread({ ...launchInput, scope: "recipe:other" }));
      assert.notStrictEqual(other.threadId, first.threadId);
    }),
  );

  it.effect("drives only threads its scope launched; watches count as the agent's", () =>
    Effect.gen(function* () {
      const host = yield* WorkflowHost.T3TeamWorkflowHost;
      const { threadId } = ok(yield* host.launchThread(launchInput));
      const op = (
        op: Parameters<typeof host.launchedThread>[0]["op"],
        overrides: Partial<typeof owner & { key: string; threadId: string }> = {},
        requestId = `req-${op.op}`,
      ) => host.launchedThread({ ...owner, key, threadId, requestId, ...overrides, op });

      ok(yield* op({ op: "watch", url, watching: true }));
      const state = ok(yield* op({ op: "read" })) as {
        pullRequests: Array<{ number: number; watching: boolean }>;
        runtimeMode: string;
      };
      assert.deepStrictEqual(
        state.pullRequests.map((pr) => [pr.number, pr.watching]),
        [[7, true]],
      );
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const link = (yield* orchestrator.getThreadProjection(ThreadId.make(threadId))).thread
        .pullRequests?.[0];
      assert.strictEqual(link?.source, "agent");

      ok(yield* op({ op: "configure", runtimeMode: "approval-required" }));
      ok(yield* op({ op: "facts", extensions: { "acme.chip": "own" } }));
      const reserved = yield* op({ op: "facts", extensions: { "t3team.recipe": {} } });
      assert.isFalse(reserved.ok);

      // A different key, scope or thread is not this recipe's to drive.
      for (const overrides of [
        { key: "pr:other#1" },
        { scope: "recipe:other" },
        { threadId: home },
      ]) {
        const refused = yield* op({ op: "send", text: "hi" }, overrides);
        assert.isFalse(refused.ok, Object.keys(overrides).join());
      }

      ok(
        yield* host.setRunFacts({
          launchThreadId: home,
          extensions: { "acme.summary": { watched: 1 } },
        }),
      );
      const facts = yield* T3TeamThreadFactsStore;
      assert.deepStrictEqual((yield* facts.get(home))?.extensions?.["acme.summary"], {
        watched: 1,
      });
    }),
  );

  it.effect("cannot re-watch after the user stopped the thread", () =>
    Effect.gen(function* () {
      const host = yield* WorkflowHost.T3TeamWorkflowHost;
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const { threadId: id } = ok(
        yield* host.launchThread({ ...launchInput, key: "pr:github.com/acme/app#8" }),
      );
      const threadId = ThreadId.make(id);
      const target = { ...owner, key: "pr:github.com/acme/app#8", threadId: id };
      ok(
        yield* host.launchedThread({
          ...target,
          requestId: "watch-8",
          op: { op: "watch", url: "https://github.com/acme/app/pull/8", watching: true },
        }),
      );
      // A message from the recipe starts a run; it finishes, then the user stops the thread.
      ok(
        yield* host.launchedThread({
          ...target,
          requestId: "send-8",
          op: { op: "send", text: "go" },
        }),
      );
      const run = (yield* orchestrator.getThreadProjection(threadId)).runs[0]!;
      const now = yield* DateTime.now;
      yield* projections.apply({
        id: EventId.make("event:launch-stop:completed"),
        type: "run.updated",
        threadId,
        runId: run.id,
        occurredAt: now,
        payload: { ...run, status: "completed", startedAt: now, completedAt: now },
      });
      yield* orchestrator.dispatch({
        type: "thread.stop",
        commandId: CommandId.make("stop-launched"),
        threadId,
      });
      const rewatch = yield* host.launchedThread({
        ...target,
        requestId: "rewatch-8",
        op: { op: "watch", url: "https://github.com/acme/app/pull/8", watching: true },
      });
      assert.deepStrictEqual(rewatch, { ok: false, error: `Thread ${id} was stopped.` });
    }),
  );
});
