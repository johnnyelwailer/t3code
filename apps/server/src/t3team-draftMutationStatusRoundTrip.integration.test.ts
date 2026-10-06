/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- HTTP route integration bridges Effect for HttpClient assertions. */
// @effect-diagnostics missingEffectContext:off - route server boot is fully provided before runPromise.
// @effect-diagnostics unsafeEffectTypeAssertion:off - scoped HTTP test layer is provided before execution.
/**
 * A reviewer's verdict, end to end and durable: the REAL publisher writes the draft artifact, the
 * REAL route records the verdict, and the STORE — the same source the client's
 * `t3team.subscribeThreadArtifacts` snapshot is built from — is what the assertions read.
 *
 * The bug this closes: a draft said `draft` forever, so an accepted rewrite came back as pending
 * review after a reload. The verdict now survives the round trip without creating a second row.
 */

import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert } from "@effect/vitest";
import { it } from "vite-plus/test";
import { ThreadId, type T3TeamMessageDraftMutationAttachment } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpBody, HttpClient, HttpRouter } from "effect/unstable/http";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { makeT3TeamDraftMutationPublisher } from "./t3team-draftMutationPublish.ts";
import { t3teamThreadDraftMutationStatusRouteLayer } from "./t3team-thread-draftMutation-status-route.ts";
import * as ThreadArtifactsStore from "./t3team-v2/t3team-threadArtifactsStore.ts";

const threadId = ThreadId.make("thread-draft-status");
const PATCH = { description: "## Goal\nCheckout must round to two decimals." };

const StoreLive = ThreadArtifactsStore.layer.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(NodeServices.layer),
);

/** ONE store instance behind both the served route and the test body's own reads. */
const testLayer = HttpRouter.serve(t3teamThreadDraftMutationStatusRouteLayer, {
  disableListenLog: true,
  disableLogger: true,
}).pipe(Layer.provideMerge(StoreLive), Layer.provideMerge(NodeHttpServer.layerTest));

const runTest = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(testLayer)) as Effect.Effect<A, E, never>,
  );

/** Publish a draft the way a draft tool result does — the real publisher, not a hand-built row. */
const publishDraft = Effect.gen(function* () {
  const store = yield* ThreadArtifactsStore.T3TeamThreadArtifactsStore;
  const publish = makeT3TeamDraftMutationPublisher({ threadId, recordArtifact: store.upsert });
  yield* publish({
    content: [{ type: "text", text: "{}" }],
    structuredContent: {
      draftMutation: {
        kind: "jira-work-item-draft",
        tool: "t3team.work_item.description.draft_update",
        target: { provider: "jira", issueIdOrKey: "PROJ-6" },
        field: "description",
        patch: PATCH,
        status: "draft",
        summary: "Rewrote the description",
        commitPolicy: { requiresUserApproval: true, commitSurface: "work-item" },
      },
    },
  });
});

const readDrafts = Effect.gen(function* () {
  const store = yield* ThreadArtifactsStore.T3TeamThreadArtifactsStore;
  const rows = yield* store.listByThread(threadId);
  return rows.map((row) => ({
    row,
    draft: (row.payload as T3TeamMessageDraftMutationAttachment).draft,
  }));
});

const postStatus = (body: unknown) =>
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const response = yield* httpClient.post("/api/t3team/thread/draft-mutation/status", {
      body: yield* HttpBody.json(body),
    });
    return { status: response.status, body: (yield* response.json) as Record<string, unknown> };
  });

it("records a verdict on the draft so a re-read stops presenting it as pending review", async () => {
  await runTest(
    Effect.gen(function* () {
      yield* Layer.build(testLayer);
      yield* publishDraft;

      const [published] = yield* readDrafts;
      assert.strictEqual(published?.row.kind, "draft-mutation");
      assert.strictEqual(published?.draft.status, "draft");
      const draftId = published?.draft.id ?? "";
      assert.strictEqual(draftId, published?.row.id);

      // The reviewer accepts.
      const accepted = yield* postStatus({ threadId, draftId, status: "applied" });
      assert.strictEqual(accepted.status, 200);
      assert.deepStrictEqual(accepted.body, { ok: true, draftId, status: "applied" });

      // The verdict is in the store, on the same single row, with the proposal untouched.
      const settled = yield* readDrafts;
      assert.strictEqual(settled.length, 1);
      assert.strictEqual(settled[0]?.draft.status, "applied");
      assert.strictEqual(settled[0]?.draft.id, draftId);
      assert.deepStrictEqual(settled[0]?.draft.patch, PATCH);

      // A dismissal rides the same path, also when addressed by the bare id.
      const bareId = draftId.slice("jira-draft:".length);
      const dismissed = yield* postStatus({
        threadId,
        carrierMessageId: bareId,
        status: "dismissed",
      });
      assert.strictEqual(dismissed.status, 200);
      assert.strictEqual((yield* readDrafts)[0]?.draft.status, "dismissed");
    }),
  );
});

it("refuses a verdict it cannot address instead of reporting a silent success", async () => {
  await runTest(
    Effect.gen(function* () {
      yield* Layer.build(testLayer);
      yield* publishDraft;
      const [published] = yield* readDrafts;

      const unknownDraft = yield* postStatus({
        threadId,
        draftId: "jira-draft:does-not-exist",
        status: "applied",
      });
      assert.strictEqual(unknownDraft.status, 502);
      assert.include(String(unknownDraft.body.error), "No draft");

      // A draft is only addressable from the thread that proposed it.
      const wrongThread = yield* postStatus({
        threadId: "thread-other",
        draftId: published?.draft.id,
        status: "applied",
      });
      assert.strictEqual(wrongThread.status, 502);

      const badStatus = yield* postStatus({
        threadId,
        draftId: "jira-draft:x",
        status: "accepted",
      });
      assert.strictEqual(badStatus.status, 502);
      assert.include(String(badStatus.body.error), "status must be one of");

      const missingIds = yield* postStatus({ threadId, status: "applied" });
      assert.strictEqual(missingIds.status, 502);
      assert.include(String(missingIds.body.error), "draftId or carrierMessageId is required");
    }),
  );
});
