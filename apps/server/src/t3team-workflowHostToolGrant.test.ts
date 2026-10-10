// @effect-diagnostics nodeBuiltinImport:off - writes a probe workflow into a temp runs root.
/**
 * The host-tool GRANT must survive a restart unchanged — in both directions.
 *
 * Rehydration rebuilds a run's CODE from host layers, and it used to decide whether to attach the
 * work-item draft bridge by asking "does this run have a launch thread?". Every ephemeral
 * `t3team.orchestration.run` run has one and none of them is granted the bridge, so a restart
 * silently upgraded a parked run's powers. Migration 047 records the grant at launch and this file
 * pins both halves of honouring it:
 *
 *   1. a run launched WITHOUT the bridge does not acquire it across rehydration;
 *   2. a run launched WITH it keeps it, and keeps its group scope.
 *
 * Real `T3TeamToolBrokerLive`, real repository/journal over in-memory SQLite, real
 * `rehydrateSuspendedWorkflowRuns`, a recording fake workflow host. The probe body parks on
 * `askUser`, so the draft call happens strictly AFTER the simulated restart; a proposed draft is
 * observed where it lands, as a `draft-mutation` thread artifact.
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { afterAll } from "vite-plus/test";
import { ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SqlClient from "effect/sql/SqlClient";

import type { ChangeRequestPublishInput } from "./t3team-changeRequestPublishErrors.ts";
import { ServerConfig } from "./config.ts";
import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import { WorkflowJournalStoreLive } from "./persistence/SqliteJournalStore.ts";
import { WorkflowRunRepositoryLive } from "./persistence/WorkflowRuns.ts";
import { WorkflowJournalStore } from "./persistence/SqliteJournalStore.ts";
import { WorkflowRunRepository } from "./persistence/WorkflowRuns.ts";
import { T3TeamToolBroker } from "./t3team-toolBroker.ts";
import {
  createThreadToolContext,
  makeBrokerLayer,
  threadId,
} from "./t3team-toolBrokerTestUtils.ts";
import type { T3TeamThreadArtifactInput } from "./t3team-v2/t3team-threadArtifactsStore.ts";
import {
  buildRunningWorkflowRunRow,
  makeWorkflowRunLifecycle,
} from "./t3team-workflowEngineDurability.ts";
import { launchWorkflowRecipe } from "./t3team-workflowEngineLaunch.ts";
import { rehydrateSuspendedWorkflowRuns } from "./t3team-workflowEngineRehydrate.ts";
import {
  makeWorkflowEngineRegistry,
  T3TeamWorkflowEngineRegistry,
  T3TeamWorkflowEngineRegistryLive,
} from "./t3team-workflowEngineRegistry.ts";
import { T3TeamWorkflowSchedulerLive } from "./t3team-workflowScheduler.ts";
import { draftToolContext, findDraftArtifact } from "./t3team-workflowHostDraft.fixtures.ts";
import { makeT3TeamWorkflowHostToolClient } from "./t3team-workflowHostTools.ts";
import {
  makeFakeWorkflowHost,
  makeFakeWorkflowHostLayer,
} from "./t3team-workflowHostFake.fixtures.ts";

const cwd = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-grant-"));
afterAll(() => NodeFS.rmSync(cwd, { recursive: true, force: true }));

// Parks on askUser first, so every draft call in this file happens after the restart.
const probeWorkflowPath = NodePath.join(cwd, "grant-probe.workflow.ts");
NodeFS.writeFileSync(
  probeWorkflowPath,
  `import { Schema } from "effect";
import { getThread, getTools } from "@t3team/sdk";
export const Inputs = Schema.Struct({});
export const meta = {
  name: "grant-probe",
  inputs: Inputs,
  capabilities: ["user", "mutation.draft"],
} as const;
export default async function run() {
  await getThread().askUser("Proceed?");
  await getTools().t3team.workItem.description.draftUpdate({
    issue_id: "T3-1",
    body: "written after the restart",
  });
  return { done: true };
}
`,
  "utf8",
);

// machine-setup shape: park on the user's answer, then publish. The launch thread's synced context
// never carries publish (server kickoff), so only the persisted grant may widen the binding.
const publishProbeWorkflowPath = NodePath.join(cwd, "grant-publish-probe.workflow.ts");
NodeFS.writeFileSync(
  publishProbeWorkflowPath,
  `import { Schema } from "effect";
import { getThread, getTools } from "@t3team/sdk";
export const Inputs = Schema.Struct({});
export const meta = {
  name: "grant-publish-probe",
  inputs: Inputs,
  capabilities: ["user", "mutation.change_request"],
} as const;
export default async function run() {
  await getThread().askUser("Open a change request?");
  const published = await getTools().t3team.changeRequest.publish({
    branch: "machine/setup",
    paths: ["a.json"],
    commitMessage: "chore: add machine setup",
    title: "Add machine setup",
    body: "Adds the dev container.",
  });
  return { published };
}
`,
  "utf8",
);

const projectId = ProjectId.make("project-1");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const nowIso = (): string => "2026-07-27T00:00:00.000Z";

/** Every thread artifact the broker writes — where a proposed draft lands. */
const brokerArtifacts: T3TeamThreadArtifactInput[] = [];
/** Recording publisher for the publish-after-rehydrate case. */
const publishCalls: ChangeRequestPublishInput[] = [];
const published = {
  url: "https://example.test/pr/7",
  number: 7,
  repository: "acme/setup",
  provider: "github" as const,
  branch: "machine/setup",
  commit: "abc1234",
  projectId,
};

const DurabilityTestLive = T3TeamWorkflowSchedulerLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      T3TeamWorkflowEngineRegistryLive,
      WorkflowRunRepositoryLive,
      WorkflowJournalStoreLive,
    ),
  ),
  Layer.provide(SqlitePersistenceMemory),
);

// The real broker is present in the layer, so rehydration COULD build a bridge — which is exactly
// what makes the no-grant case meaningful rather than vacuous.
const TestLayer = Layer.mergeAll(
  DurabilityTestLive,
  makeFakeWorkflowHostLayer().layer,
  makeBrokerLayer(undefined, {
    onArtifact: (artifact) => brokerArtifacts.push(artifact),
    changeRequestPublisher: {
      publish: (input) =>
        Effect.sync(() => {
          publishCalls.push(input);
          return published;
        }),
    },
  }),
  ServerConfig.layerTest(cwd, { prefix: "t3-grant-test-" }),
  SqlitePersistenceMemory, // same reference as DurabilityTestLive's, so it's memoized — exposes SqlClient below.
).pipe(Layer.provideMerge(NodeServices.layer));

const draftCarrier = () => findDraftArtifact(brokerArtifacts);

/** Launch the probe, park it on `askUser`, and leave the DB holding a suspended run. */
const parkProbe = Effect.fn("parkProbe")(function* (input: {
  readonly runId: string;
  readonly granted: boolean;
  /** Distinct thread for concurrent parks — one pending ask per thread; defaults to `threadId`. */
  readonly launchThreadId?: ThreadId;
}) {
  const repo = yield* WorkflowRunRepository;
  const store = yield* WorkflowJournalStore;
  const config = yield* ServerConfig;
  const broker = yield* T3TeamToolBroker;
  const runThreadId = input.launchThreadId ?? threadId;

  // Seed the launch thread's tool context, as the web composer does before a turn.
  yield* broker.bindSession({
    threadId: runThreadId,
    toolContext: draftToolContext(),
  });

  const hostToolGrant = input.granted ? { toolGroups: ["mutation.draft"] } : undefined;
  const hostToolClient = input.granted
    ? makeT3TeamWorkflowHostToolClient({
        broker,
        launchThreadId: runThreadId,
        allowedToolGroups: ["mutation.draft"],
      })
    : undefined;

  let seq = 0;
  const launched = yield* Effect.promise(() =>
    launchWorkflowRecipe({
      runId: input.runId,
      workflowPath: probeWorkflowPath,
      args: {},
      runsRoot: NodePath.join(config.cwd, ".t3team-runs"),
      launchThreadId: runThreadId,
      projectId,
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      // A throwaway registry: this uptime dies with the "restart".
      registry: makeWorkflowEngineRegistry(),
      host: makeFakeWorkflowHost().host,
      newId: () => `${input.runId}-id-${(seq += 1)}`,
      nowIso,
      store,
      ...(hostToolClient === undefined ? {} : { hostToolClient }),
      lifecycle: makeWorkflowRunLifecycle({
        repo,
        row: buildRunningWorkflowRunRow({
          runId: input.runId,
          workflowPath: probeWorkflowPath,
          args: {},
          launchThreadId: runThreadId,
          projectId,
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          origin: input.granted ? "recipe" : "ephemeral",
          ...(hostToolGrant === undefined ? {} : { hostToolGrant }),
          nowIso: nowIso(),
        }),
        nowIso,
      }),
    }),
  );
  assert.strictEqual(launched.status, "suspended");
  return yield* repo.getById({ runId: input.runId }).pipe(Effect.map(Option.getOrThrow));
});

it.effect("a run launched WITHOUT host tools does not acquire them across rehydration", () =>
  Effect.gen(function* () {
    brokerArtifacts.length = 0;
    const runId = "grant-absent";
    const row = yield* parkProbe({ runId, granted: false });
    // Nothing was granted, so nothing is recorded — this is what rehydration reads.
    assert.isNotOk(row.hostToolGrant);

    yield* rehydrateSuspendedWorkflowRuns();

    const registry = yield* T3TeamWorkflowEngineRegistry;
    const ask = registry.peekPending(threadId);
    assert.strictEqual(ask?.kind, "user.input");
    yield* Effect.promise(() => registry.getRun(runId)!.resume(ask!.correlationId, "yes"));

    // The restart must not have handed it a bridge it never had.
    const settled = Option.getOrThrow(yield* (yield* WorkflowRunRepository).getById({ runId }));
    assert.strictEqual(settled.status, "failed");
    assert.include(settled.failureReason ?? "", "thread-bound host runtime");
    assert.isUndefined(draftCarrier());
  }).pipe(Effect.provide(TestLayer)),
);

it.effect("a PAUSED run honours the grant too — the shared rebuild path, not just suspended", () =>
  Effect.gen(function* () {
    brokerArtifacts.length = 0;
    const repo = yield* WorkflowRunRepository;
    const runId = "grant-paused";
    const row = yield* parkProbe({ runId, granted: false });

    // Paused rows rebuild through the same `rebuildController` (and so the same
    // `hostToolClientFor`) as suspended ones, but are woken by an explicit Resume rather than by
    // the reactor: they get no registry pending ask, and a paused row is refused admission until
    // un-paused. So rebuild FROM the paused row, then un-pause and drive it by correlation.
    yield* repo.setStatus({ runId, status: "paused", updatedAt: nowIso() });
    yield* rehydrateSuspendedWorkflowRuns();

    const registry = yield* T3TeamWorkflowEngineRegistry;
    const run = registry.getRun(runId);
    assert.isDefined(run);
    yield* repo.resumePaused({ runId, updatedAt: nowIso() });
    yield* Effect.promise(() => run!.resume(row.pendingCorrelationId!, "yes"));

    const settled = Option.getOrThrow(yield* repo.getById({ runId }));
    assert.strictEqual(settled.status, "failed");
    assert.include(settled.failureReason ?? "", "thread-bound host runtime");
    assert.isUndefined(draftCarrier());
  }).pipe(Effect.provide(TestLayer)),
);

it.effect("a run launched WITH a host-tool grant keeps it, and its scope, across rehydration", () =>
  Effect.gen(function* () {
    brokerArtifacts.length = 0;
    const runId = "grant-present";
    const row = yield* parkProbe({ runId, granted: true });
    assert.deepStrictEqual(row.hostToolGrant, { toolGroups: ["mutation.draft"] });

    yield* rehydrateSuspendedWorkflowRuns();

    const registry = yield* T3TeamWorkflowEngineRegistry;
    const ask = registry.peekPending(threadId);
    assert.strictEqual(ask?.kind, "user.input");
    yield* Effect.promise(() => registry.getRun(runId)!.resume(ask!.correlationId, "yes"));

    const settled = Option.getOrThrow(yield* (yield* WorkflowRunRepository).getById({ runId }));
    assert.strictEqual(settled.status, "completed");
    const carrier = draftCarrier();
    assert.isDefined(carrier);
    assert.strictEqual(carrier?.threadId, threadId);
  }).pipe(Effect.provide(TestLayer)),
);

it.effect(
  "a malformed host_tool_grant rehydrates only that row ungranted — siblings in the same scan are unaffected",
  () =>
    Effect.gen(function* () {
      brokerArtifacts.length = 0;
      const sql = yield* SqlClient.SqlClient;

      const bad1 = {
        runId: "grant-malformed-string",
        thread: ThreadId.make("thread-malformed-string"),
      };
      const bad2 = {
        runId: "grant-malformed-shape",
        thread: ThreadId.make("thread-malformed-shape"),
      };
      // The good sibling runs its draft on the broker fixture's one known thread.
      const good = { runId: "grant-malformed-sibling-good", thread: threadId };

      // Park all three, then bypass the repo's encoder (it would reject these) with a raw write.
      yield* parkProbe({ runId: bad1.runId, granted: false, launchThreadId: bad1.thread });
      yield* parkProbe({ runId: bad2.runId, granted: false, launchThreadId: bad2.thread });
      const goodRow = yield* parkProbe({
        runId: good.runId,
        granted: true,
        launchThreadId: good.thread,
      });
      assert.deepStrictEqual(goodRow.hostToolGrant, { toolGroups: ["mutation.draft"] });
      yield* sql`UPDATE workflow_runs SET host_tool_grant = 'not-json' WHERE run_id = ${bad1.runId}`; // unparsable string
      yield* sql`UPDATE workflow_runs SET host_tool_grant = ${'{"toolGroups":123}'} WHERE run_id = ${bad2.runId}`; // valid JSON, wrong shape

      yield* rehydrateSuspendedWorkflowRuns(); // ONE scan; a bad row must not fail the whole query

      for (const { runId, thread, expectFailed } of [
        { ...bad1, expectFailed: true },
        { ...bad2, expectFailed: true },
        { ...good, expectFailed: false },
      ] as const) {
        const registry = yield* T3TeamWorkflowEngineRegistry;
        const ask = registry.peekPending(thread);
        assert.strictEqual(ask?.kind, "user.input", `no restored ask for ${runId}`);
        yield* Effect.promise(() => registry.getRun(runId)!.resume(ask!.correlationId, "yes"));
        const settled = Option.getOrThrow(yield* (yield* WorkflowRunRepository).getById({ runId }));
        assert.strictEqual(settled.status, expectFailed ? "failed" : "completed");
        if (expectFailed) assert.include(settled.failureReason ?? "", "thread-bound host runtime");
      }
      const carrier = draftCarrier();
      assert.isDefined(carrier);
      assert.strictEqual(carrier?.threadId, good.thread);
    }).pipe(Effect.provide(TestLayer)),
);

it.effect("a server-launched publish grant still reaches the publisher after rehydration", () =>
  Effect.gen(function* () {
    // Live machine-setup failure: kickoff parks on askUser, the desktop restarts or the run
    // resumes after the answer, and publish must still work even though the launch thread never
    // had that tool synced into its context.
    publishCalls.length = 0;
    const runId = "grant-publish-rehydrated";
    const repo = yield* WorkflowRunRepository;
    const store = yield* WorkflowJournalStore;
    const config = yield* ServerConfig;
    const broker = yield* T3TeamToolBroker;

    // No publish tool in the synced context — the cloud kickoff path never unions it in.
    yield* broker.bindSession({
      threadId,
      toolContext: createThreadToolContext({
        tools: [{ id: "t3team.thread.children", label: "Children", capabilities: ["read"] }],
      }),
    });

    const hostToolGrant = { toolGroups: ["mutation.change_request"] };
    const hostToolClient = makeT3TeamWorkflowHostToolClient({
      broker,
      launchThreadId: threadId,
      allowedToolGroups: ["mutation.change_request"],
    });

    let seq = 0;
    const launched = yield* Effect.promise(() =>
      launchWorkflowRecipe({
        runId,
        workflowPath: publishProbeWorkflowPath,
        args: {},
        runsRoot: NodePath.join(config.cwd, ".t3team-runs"),
        launchThreadId: threadId,
        projectId,
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        registry: makeWorkflowEngineRegistry(),
        host: makeFakeWorkflowHost().host,
        newId: () => `${runId}-id-${(seq += 1)}`,
        nowIso,
        store,
        ...(hostToolClient === undefined ? {} : { hostToolClient }),
        lifecycle: makeWorkflowRunLifecycle({
          repo,
          row: buildRunningWorkflowRunRow({
            runId,
            workflowPath: publishProbeWorkflowPath,
            args: {},
            launchThreadId: threadId,
            projectId,
            modelSelection,
            runtimeMode: "full-access",
            interactionMode: "default",
            origin: "recipe",
            hostToolGrant,
            nowIso: nowIso(),
          }),
          nowIso,
        }),
      }),
    );
    assert.strictEqual(launched.status, "suspended");
    assert.deepStrictEqual(
      Option.getOrThrow(yield* repo.getById({ runId })).hostToolGrant,
      hostToolGrant,
    );
    assert.strictEqual(publishCalls.length, 0);

    // Drop the live controller; boot rehydration rebuilds the host-tool client from the row.
    yield* rehydrateSuspendedWorkflowRuns();

    const registry = yield* T3TeamWorkflowEngineRegistry;
    const ask = registry.peekPending(threadId);
    assert.strictEqual(ask?.kind, "user.input");
    yield* Effect.promise(() => registry.getRun(runId)!.resume(ask!.correlationId, "yes"));

    const settled = Option.getOrThrow(yield* repo.getById({ runId }));
    assert.strictEqual(settled.status, "completed");
    assert.strictEqual(publishCalls.length, 1);
    assert.deepStrictEqual(
      {
        cwd: publishCalls[0]?.cwd,
        projectId: publishCalls[0]?.projectId,
        branch: publishCalls[0]?.branch,
        paths: publishCalls[0]?.paths,
      },
      {
        cwd: "/workspace/project-1",
        projectId: "project-1",
        branch: "machine/setup",
        paths: ["a.json"],
      },
    );
  }).pipe(Effect.provide(TestLayer)),
);
