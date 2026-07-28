/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- HTTP route integration bridges Effect for HttpClient assertions. */
// @effect-diagnostics missingEffectContext:off - route server boot is fully provided before runPromise.
// @effect-diagnostics unsafeEffectTypeAssertion:off - scoped HTTP test layer is provided before execution.
/**
 * A reviewer's verdict, end to end and durable: the REAL publish path writes the carrier, the REAL
 * route records the verdict, and the PROJECTION — the same source the client's thread re-read is
 * built from — is what the assertions read.
 *
 * The bug this closes: the carrier said `draft` forever, so an accepted rewrite came back as pending
 * review after a reload. The verdict now survives the round trip, and the carrier stays hidden while
 * doing so — a status change that surfaced the carrier would put an empty message in the chat.
 */

import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert } from "@effect/vitest";
import { it } from "vite-plus/test";
import {
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type T3TeamMessageDraftMutationAttachment,
} from "@t3tools/contracts";
import { CommandId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { HttpBody, HttpClient, HttpRouter } from "effect/unstable/http";

import { OrchestrationCommandReceiptRepositoryLive } from "./persistence/Layers/OrchestrationCommandReceipts.ts";
import { OrchestrationEventStoreLive } from "./persistence/Layers/OrchestrationEventStore.ts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { OrchestrationEngineLive } from "./orchestration/Layers/OrchestrationEngine.ts";
import { OrchestrationProjectionPipelineLive } from "./orchestration/Layers/ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./orchestration/Layers/ProjectionSnapshotQuery.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import * as RepositoryIdentityResolver from "./project/RepositoryIdentityResolver.ts";
import { ServerConfig } from "./config.ts";
import { makeT3TeamDraftMutationPublisher } from "./t3team-draftMutationPublish.ts";
import { t3teamThreadDraftMutationStatusRouteLayer } from "./t3team-thread-draftMutation-status-route.ts";

const projectId = ProjectId.make("proj-draft-status");
const threadId = "thread-draft-status";
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const ISO = "2026-07-28T00:00:00.000Z";
const PATCH = { description: "## Goal\nCheckout must round to two decimals." };

const EngineLive = OrchestrationEngineLive.pipe(
  Layer.provideMerge(OrchestrationProjectionSnapshotQueryLive),
  Layer.provide(OrchestrationProjectionPipelineLive),
  Layer.provide(OrchestrationEventStoreLive),
  Layer.provide(OrchestrationCommandReceiptRepositoryLive),
  Layer.provide(RepositoryIdentityResolver.layer),
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "t3-draft-status-" })),
  Layer.provideMerge(NodeServices.layer),
);

/** ONE engine instance behind both the served route and the test body's own reads. */
const testLayer = HttpRouter.serve(t3teamThreadDraftMutationStatusRouteLayer, {
  disableListenLog: true,
  disableLogger: true,
}).pipe(Layer.provideMerge(EngineLive), Layer.provideMerge(NodeHttpServer.layerTest));

const runTest = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(testLayer)) as Effect.Effect<A, E, never>,
  );

const seed = Effect.gen(function* () {
  const orchestration = yield* OrchestrationEngineService;
  yield* orchestration.dispatch({
    type: "project.create",
    commandId: CommandId.make("draft-status-project"),
    projectId,
    title: "Draft Status Project",
    workspaceRoot: "/tmp/draft-status",
    defaultModelSelection: modelSelection,
    createdAt: ISO,
  });
  yield* orchestration.dispatch({
    type: "thread.create",
    commandId: CommandId.make("draft-status-thread"),
    threadId: ThreadId.make(threadId),
    projectId,
    title: "Review thread",
    modelSelection,
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    createdAt: ISO,
  });
});

/** Publish a carrier the way a draft tool result does — the real publisher, not a hand-built message. */
const publishCarrier = Effect.gen(function* () {
  const orchestration = yield* OrchestrationEngineService;
  const publish = makeT3TeamDraftMutationPublisher({
    threadId,
    dispatch: (command) => orchestration.dispatch(command),
  });
  yield* publish({
    content: [{ type: "text", text: "{}" }],
    structuredContent: {
      draftMutation: {
        kind: "jira-work-item-draft",
        tool: "t3team.work_item.description.draft_update",
        target: { provider: "jira", issueIdOrKey: "NXAI-6" },
        field: "description",
        patch: PATCH,
        status: "draft",
        summary: "Rewrote the description",
        commitPolicy: { requiresUserApproval: true, commitSurface: "work-item" },
      },
    },
  });
});

const readCarrier = Effect.gen(function* () {
  const query = yield* ProjectionSnapshotQuery;
  const thread = Option.getOrThrow(yield* query.getThreadDetailById(ThreadId.make(threadId)));
  const carrier = thread.messages.find((message) =>
    (message.t3teamExt?.attachments ?? []).some(
      (attachment) => attachment.kind === "draft-mutation",
    ),
  );
  const attachment = (carrier?.t3teamExt?.attachments ?? []).find(
    (entry): entry is T3TeamMessageDraftMutationAttachment => entry.kind === "draft-mutation",
  );
  return { thread, carrier, draft: attachment?.draft };
});

const postStatus = (body: unknown) =>
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const response = yield* httpClient.post("/api/t3team/thread/draft-mutation/status", {
      body: yield* HttpBody.json(body),
    });
    return { status: response.status, body: (yield* response.json) as Record<string, unknown> };
  });

it("records a verdict on the carrier so a re-read stops presenting it as pending review", async () => {
  await runTest(
    Effect.gen(function* () {
      yield* Layer.build(testLayer);
      yield* seed;
      yield* publishCarrier;

      // As published: exactly the shape every carrier written before this slice had, and it decodes.
      const published = yield* readCarrier;
      assert.strictEqual(published.draft?.status, "draft");
      assert.strictEqual(published.carrier?.role, "system");
      assert.strictEqual(published.carrier?.text, "");
      assert.strictEqual(published.carrier?.t3teamExt?.visibleToUser, false);
      const draftId = published.draft?.id ?? "";
      assert.strictEqual(draftId, `jira-draft:${published.carrier?.id ?? ""}`);
      const messageCount = published.thread.messages.length;

      // The reviewer accepts.
      const accepted = yield* postStatus({ threadId, draftId, status: "applied" });
      assert.strictEqual(accepted.status, 200);
      assert.deepStrictEqual(accepted.body, { ok: true, draftId, status: "applied" });

      // The verdict is in the PROJECTION — what a thread re-read returns.
      const settled = yield* readCarrier;
      assert.strictEqual(settled.draft?.status, "applied");
      assert.strictEqual(settled.draft?.id, draftId);
      // A verdict never rewrites the proposal it settles.
      assert.deepStrictEqual(settled.draft?.patch, PATCH);
      // Still ONE hidden carrier, not a new visible chat message.
      assert.strictEqual(settled.thread.messages.length, messageCount);
      assert.strictEqual(settled.carrier?.id, published.carrier?.id);
      assert.strictEqual(settled.carrier?.role, "system");
      assert.strictEqual(settled.carrier?.text, "");
      assert.strictEqual(settled.carrier?.t3teamExt?.visibleToUser, false);
      assert.strictEqual(settled.carrier?.t3teamExt?.visibleToAgent, false);

      // A dismissal rides the same path…
      const dismissed = yield* postStatus({ threadId, draftId, status: "dismissed" });
      assert.strictEqual(dismissed.status, 200);
      assert.strictEqual((yield* readCarrier).draft?.status, "dismissed");
    }),
  );
});

it("refuses a verdict it cannot address instead of reporting a silent success", async () => {
  await runTest(
    Effect.gen(function* () {
      yield* Layer.build(testLayer);
      yield* seed;
      yield* publishCarrier;

      const unknownCarrier = yield* postStatus({
        threadId,
        draftId: "jira-draft:does-not-exist",
        status: "applied",
      });
      assert.strictEqual(unknownCarrier.status, 502);
      assert.include(String(unknownCarrier.body.error), "No draft carrier");

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
