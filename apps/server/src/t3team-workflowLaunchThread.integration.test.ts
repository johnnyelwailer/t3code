// @effect-diagnostics nodeBuiltinImport:off - integration test reads a workflow fixture + temp dir.
/**
 * `launchThread` end to end on the real V2 orchestrator, workflow engine and host: a run launches
 * a top-level thread by key, watches its pull request, parks on an agent step, and after the
 * resume replays its journal it finds the same thread again without launching a second one.
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { assert, it } from "@effect/vitest";
import { afterAll } from "vite-plus/test";
import { T3TEAM_LAUNCHED_BY_FACT_KEY, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { T3TeamThreadFactsStore } from "./t3team-v2/t3team-threadFactsStore.ts";
import {
  launchScenarioWorkflow,
  setUpLaunchThread,
  waitUntil,
} from "./t3team-workflowEngineScenario.fixtures.ts";
import { makeWorkflowStubRuntime } from "./t3team-workflowStubRuntime.ts";

const fixture = (name: string) =>
  NodeURL.fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url));
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-launch-thread-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

it.live("launches by key, survives the resume, and never launches the key twice", () => {
  const runtime = makeWorkflowStubRuntime({
    name: "t3team-workflow-launch-thread",
    respond: () => "ready",
  });
  return Effect.gen(function* () {
    const threads = yield* ThreadManagementService;
    const facts = yield* T3TeamThreadFactsStore;
    const { projectId, launchThreadId } = yield* setUpLaunchThread("launch-thread");
    const run = yield* launchScenarioWorkflow({
      runId: "launch-run",
      workflowPath: fixture("t3team-launchThread.workflow.ts"),
      launchThreadId,
      projectId,
      runsRoot,
    });
    assert.strictEqual(run.launched.status, "suspended");
    yield* waitUntil(() => run.completed.length > 0 || run.errors.length > 0, "the run to end");
    assert.deepStrictEqual(run.errors, []);
    const output = run.completed[0] as {
      first: string;
      second: string;
      secondCreated: boolean;
      watching: boolean;
      verdict: string;
    };
    assert.strictEqual(output.second, output.first);
    assert.isFalse(output.secondCreated);
    assert.isTrue(output.watching);
    assert.strictEqual(output.verdict, "ready");
    // One launch: the resume replayed the first from the journal, the second found the key.
    assert.strictEqual(runtime.launches.length, 1);
    assert.strictEqual(runtime.launches[0]?.runtimeMode, "approval-required");

    // A top-level thread that outlives the run and says who launched it.
    const launched = yield* threads.getThreadShell(ThreadId.make(output.first));
    assert.isNull(launched?.lineage.parentThreadId ?? null);
    assert.isNull(launched?.archivedAt ?? null);
    assert.deepInclude(
      (yield* facts.get(ThreadId.make(output.first)))?.extensions?.[
        T3TEAM_LAUNCHED_BY_FACT_KEY
      ] as object,
      {
        runId: "launch-run",
        launchThreadId,
        key: "pr:github.com/acme/app#7",
        scope: "run:launch-run",
      },
    );
    assert.deepStrictEqual(
      (yield* facts.get(ThreadId.make(launchThreadId)))?.extensions?.["acme.summary"],
      { watched: 1 },
    );
  }).pipe(Effect.provide(runtime.layer));
});
