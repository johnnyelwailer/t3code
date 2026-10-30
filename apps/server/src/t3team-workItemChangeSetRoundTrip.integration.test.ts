/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- HTTP route integration bridges Effect for HttpClient assertions. */
// @effect-diagnostics missingEffectContext:off - route server boot is fully provided before runPromise.
// @effect-diagnostics unsafeEffectTypeAssertion:off - scoped HTTP test layer is provided before execution.
/**
 * A change set's verdict, end to end: the REAL tool and publisher write the artifacts, the REAL
 * route records the verdict, and the STORE (the source of the client's artifacts snapshot) is read.
 */
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert } from "@effect/vitest";
import { it } from "vite-plus/test";
import {
  readWorkItemChangeSetOperationStatuses,
  ThreadId,
  WorkItemChangeSet,
} from "@t3tools/contracts";
import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { HttpBody, HttpClient, HttpRouter } from "effect/http";

import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import { makeT3TeamDraftMutationPublisher } from "./t3team-draftMutationPublish.ts";
import { t3teamThreadDraftMutationStatusRouteLayer } from "./t3team-thread-draftMutation-status-route.ts";
import { callT3TeamWorkItemChangeSetTool } from "./t3team-toolBrokerBindingWorkItemChangeSet.ts";
import * as ThreadArtifactsStore from "./t3team-v2/t3team-threadArtifactsStore.ts";

const threadId = ThreadId.make("thread-cs-verdict");
const decodeChangeSet = Schema.decodeUnknownSync(WorkItemChangeSet);

const StoreLive = ThreadArtifactsStore.layer.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(NodeServices.layer),
);
const testLayer = HttpRouter.serve(t3teamThreadDraftMutationStatusRouteLayer, {
  disableListenLog: true,
  disableLogger: true,
}).pipe(Layer.provideMerge(StoreLive), Layer.provideMerge(NodeHttpServer.layerTest));

const runTest = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(testLayer)) as Effect.Effect<A, E, never>,
  );

const publishChangeSet = Effect.gen(function* () {
  const store = yield* ThreadArtifactsStore.T3TeamThreadArtifactsStore;
  return yield* callT3TeamWorkItemChangeSetTool({
    scopeLabel: "for this thread",
    threadId,
    toolArgs: {
      title: "Tidy up",
      operations: [
        { op: "comment", issue_id: "IES-1", body: "A note" },
        { op: "status", issue_id: "IES-1", target_status: "Done" },
        { op: "assignee", issue_id: "IES-2", assignee_account_id: null },
      ],
    },
    workItemReadTools: {
      connected: () => Effect.succeed(true),
      foreignKeys: () => Effect.succeed([]),
      search: () => Effect.die("unused"),
      get: () => Effect.die("unused"),
    },
    readView: () => Effect.succeed({ state: null }),
    publishDraft: makeT3TeamDraftMutationPublisher({
      threadId,
      recordArtifact: store.upsert,
      removeArtifact: store.remove,
    }),
  });
});

const readRows = Effect.gen(function* () {
  const store = yield* ThreadArtifactsStore.T3TeamThreadArtifactsStore;
  return yield* store.listByThread(threadId);
});

const postStatus = (body: unknown) =>
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const response = yield* httpClient.post("/api/t3team/thread/draft-mutation/status", {
      body: yield* HttpBody.json(body),
    });
    return { status: response.status, body: (yield* response.json) as Record<string, unknown> };
  });

it("discarding a change set dismisses its pending drafts, keeps applied ones, and survives a re-read", async () => {
  replaceFeatureFlagPresetValues(new Map([["WORKITEM_DETAIL_DRAFTS", true]]));
  await runTest(
    Effect.gen(function* () {
      yield* Layer.build(testLayer);
      const published = yield* publishChangeSet;
      assert.isUndefined(published.isError);
      const rows = yield* readRows;
      const set = rows.find((row) => row.kind === "work-item-change-set")!;
      const changeSet = decodeChangeSet(set.payload);
      assert.deepEqual(
        readWorkItemChangeSetOperationStatuses(changeSet, rows).map((op) => op.status),
        ["draft", "draft", "draft"],
      );

      // One operation is applied the existing way (the client's accept handler records it).
      const appliedId = changeSet.operations[0]!.draftId;
      assert.strictEqual(
        (yield* postStatus({ threadId, draftId: appliedId, status: "applied" })).status,
        200,
      );

      const discard = { threadId, changeSetId: set.id, status: "discarded" };
      const first = yield* postStatus(discard);
      assert.deepStrictEqual(first.body, { ok: true, changeSetId: set.id, status: "discarded" });

      const settled = yield* readRows;
      assert.strictEqual(
        decodeChangeSet(settled.find((row) => row.id === set.id)!.payload).status,
        "discarded",
      );
      assert.deepEqual(
        readWorkItemChangeSetOperationStatuses(changeSet, settled).map((op) => op.status),
        ["applied", "dismissed", "dismissed"],
      );
      // Same rows, same operations: nothing was created or rewritten beyond the verdicts.
      assert.deepEqual(
        settled.map((row) => row.id),
        rows.map((row) => row.id),
      );
      assert.deepEqual(
        decodeChangeSet(settled.find((row) => row.id === set.id)!.payload).operations,
        changeSet.operations,
      );

      // Repeating the verdict, by the bare id, is a no-op and does not resurrect anything.
      const again = yield* postStatus({
        ...discard,
        changeSetId: set.id.slice("jira-changeset:".length),
      });
      assert.strictEqual(again.status, 200);
      assert.deepEqual(yield* readRows, settled);
    }),
  );
});

it("refuses a change set verdict it cannot address or that is not a discard", async () => {
  replaceFeatureFlagPresetValues(new Map([["WORKITEM_DETAIL_DRAFTS", true]]));
  await runTest(
    Effect.gen(function* () {
      yield* Layer.build(testLayer);
      yield* publishChangeSet;
      const rows = yield* readRows;
      const set = rows.find((row) => row.kind === "work-item-change-set")!;
      const draft = rows.find((row) => row.kind === "draft-mutation")!;

      for (const body of [
        { threadId, changeSetId: "jira-changeset:nope", status: "discarded" },
        { threadId: "thread-other", changeSetId: set.id, status: "discarded" },
        { threadId, changeSetId: draft.id, status: "discarded" },
        { threadId, changeSetId: set.id, status: "applied" },
        { threadId, changeSetId: set.id, status: "draft" },
        { threadId, changeSetId: null, status: "discarded" },
        { threadId, changeSetId: 7, status: "discarded" },
        { threadId, changeSetId: { id: set.id }, status: "discarded" },
      ]) {
        assert.strictEqual((yield* postStatus(body)).status, 502, JSON.stringify(body));
      }
      assert.deepEqual(yield* readRows, rows);
    }),
  );
});
