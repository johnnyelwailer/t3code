/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Legacy async tests intentionally bridge Effect runtimes; tracked cleanup is separate from upstream green gate. */
// @effect-diagnostics nodeBuiltinImport:off - integration test reads a workflow fixture + temp dir.
/**
 * Real-path proof for the `askUser` decision card (Epic 25 §askUser decision cards), sibling of
 * the reactor integration test: REAL OrchestrationEngine + projection pipeline + the production
 * `T3workWorkflowEngineReactorLive` over `SqlitePersistenceMemory`.
 *
 *   1. launch → `askUser` with a `Schema.Literals` choice + an attached resource → suspends on
 *      `user.input`, and the escalation `thread.message.upsert` carries the
 *      `workflow.decision` view (question + affordance + correlationId) PLUS the resource
 *      attachment, tagged `waiting-for-input`.
 *   2. the resolve route's value check (same helper the HTTP handler runs against the same live
 *      registry state) rejects an out-of-range value and a stale correlationId, accepts a
 *      offered choice.
 *   3. the route-shaped reply message (display text + `t3workExt.workflowReply`) lands as a
 *      domain event → the REAL reactor resolves the parked ask with the STRUCTURED value →
 *      the run completes with the schema-validated choice.
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { afterAll } from "vite-plus/test";
import {
  CommandId,
  MessageId,
  type OrchestrationCommand,
  ProjectId,
  ProviderInstanceId,
  type T3workMessageExt,
  ThreadId,
} from "@t3tools/contracts";
import { PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION } from "@t3tools/project-recipes";
import { createModelSelection } from "@t3tools/shared/model";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { OrchestrationCommandReceiptRepositoryLive } from "./persistence/Layers/OrchestrationCommandReceipts.ts";
import { OrchestrationEventStoreLive } from "./persistence/Layers/OrchestrationEventStore.ts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { OrchestrationEngineLive } from "./orchestration/Layers/OrchestrationEngine.ts";
import { OrchestrationProjectionPipelineLive } from "./orchestration/Layers/ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./orchestration/Layers/ProjectionSnapshotQuery.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import * as RepositoryIdentityResolver from "./project/RepositoryIdentityResolver.ts";
import { ServerConfig } from "./config.ts";
import { launchWorkflowRecipe } from "./t3work-workflowEngineLaunch.ts";
import { T3workWorkflowEngineReactorLive } from "./t3work-workflowEngineReactor.ts";
import {
  T3workWorkflowEngineRegistry,
  T3workWorkflowEngineRegistryLive,
} from "./t3work-workflowEngineRegistry.ts";
import { rejectWorkflowResolveValue } from "./t3work-workflowResolveInput.ts";

const workflowPath = NodeURL.fileURLToPath(
  new URL("../__fixtures__/t3work-decisionChoice.workflow.ts", import.meta.url),
);
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3work-decision-"));

const projectId = ProjectId.make("proj-decision");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const ISO = "2026-06-09T00:00:00.000Z";

const EngineLive = OrchestrationEngineLive.pipe(
  Layer.provide(OrchestrationProjectionSnapshotQueryLive),
  Layer.provide(OrchestrationProjectionPipelineLive),
  Layer.provide(OrchestrationEventStoreLive),
  Layer.provide(OrchestrationCommandReceiptRepositoryLive),
  Layer.provide(RepositoryIdentityResolver.layer),
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "t3-workflow-decision-" })),
  Layer.provideMerge(NodeServices.layer),
);

const TestLayer = T3workWorkflowEngineReactorLive.pipe(
  Layer.provideMerge(Layer.merge(EngineLive, T3workWorkflowEngineRegistryLive)),
);

/** Poll an in-memory predicate (observe-only; never resolves an ask) until it holds or times out. */
const waitUntil = (predicate: () => boolean, label: string): Effect.Effect<void> =>
  Effect.gen(function* () {
    for (let i = 0; i < 1000; i += 1) {
      if (predicate()) return;
      yield* Effect.sleep(Duration.millis(5));
    }
    return yield* Effect.die(new Error(`timed out waiting for: ${label}`));
  });

it.live(
  "askUser decision card: launch → suspend emits the decision view + attachments, structured value is checked and resumes the run",
  () =>
    Effect.gen(function* () {
      const orchestration = yield* OrchestrationEngineService;
      const registry = yield* T3workWorkflowEngineRegistry;

      // Let the forked reactor subscribe to the hot `streamDomainEvents` PubSub first.
      yield* Effect.sleep(Duration.millis(100));

      const runId = "decision-run";
      const launchThreadId = "decision-launch";
      const args = { question: "Release decision for BUG-7?" };

      yield* orchestration.dispatch({
        type: "project.create",
        commandId: CommandId.make("decision-project"),
        projectId,
        title: "Decision Project",
        workspaceRoot: "/tmp/decision-project",
        defaultModelSelection: modelSelection,
        createdAt: ISO,
      });
      yield* orchestration.dispatch({
        type: "thread.create",
        commandId: CommandId.make("decision-launch-thread"),
        threadId: ThreadId.make(launchThreadId),
        projectId,
        title: "Launch thread",
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdAt: ISO,
      });

      const dispatched: OrchestrationCommand[] = [];
      const completed: unknown[] = [];
      let seq = 0;
      const dispatch = (command: OrchestrationCommand): Promise<void> => {
        dispatched.push(command);
        return Effect.runPromise(orchestration.dispatch(command)).then(() => undefined);
      };

      // ── 1. Launch: askUser fires the decision-card escalation, then suspends. ──
      const launched = yield* Effect.promise(() =>
        launchWorkflowRecipe({
          runId,
          workflowPath,
          args,
          runsRoot,
          launchThreadId,
          projectId,
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          registry,
          dispatch,
          newId: () => `id-${(seq += 1)}`,
          nowIso: () => ISO,
          onComplete: async (output) => {
            completed.push(output);
          },
        }),
      );
      assert.strictEqual(launched.status, "suspended");

      const pending = registry.peekPending(launchThreadId);
      assert.strictEqual(pending?.kind, "user.input");
      assert.deepStrictEqual(pending?.affordance, {
        kind: "choice",
        options: ["ship-now", "hold", "rollback"],
      });

      // The escalation message carries the decision view + the resource attachment.
      const upsert = dispatched.find((command) => command.type === "thread.message.upsert");
      assert.isDefined(upsert);
      if (upsert?.type !== "thread.message.upsert") throw new Error("unreachable");
      const ext: T3workMessageExt | undefined = upsert.message.t3workExt;
      assert.strictEqual(ext?.status, "waiting-for-input");
      assert.strictEqual(upsert.message.text, args.question);
      const [view, resource] = ext?.attachments ?? [];
      if (view?.kind !== "view") throw new Error("expected a view attachment first");
      assert.strictEqual(view.miniappId, PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION);
      assert.deepStrictEqual(view.props["affordance"], {
        kind: "choice",
        options: ["ship-now", "hold", "rollback"],
      });
      assert.strictEqual(view.props["question"], args.question);
      assert.strictEqual(view.props["correlationId"], pending?.correlationId);
      if (resource?.kind !== "resource") throw new Error("expected a resource attachment second");
      assert.deepStrictEqual(resource.resource, {
        provider: "jira",
        kind: "issue",
        id: "BUG-7",
        displayId: "BUG-7",
        title: "Checkout rounding error",
        url: "https://example.atlassian.net/browse/BUG-7",
        status: "Open",
      });

      // ── 2. The resolve route's check against the LIVE pending state: an out-of-range value
      // and a stale correlationId are rejected; an offered choice passes. ──
      assert.isNotNull(
        rejectWorkflowResolveValue({
          pending,
          correlationId: pending?.correlationId,
          hasValue: true,
          value: "merge-later",
        }),
      );
      assert.isNotNull(
        rejectWorkflowResolveValue({
          pending,
          correlationId: "decision-run:999",
          hasValue: true,
          value: "hold",
        }),
      );
      assert.isNull(
        rejectWorkflowResolveValue({
          pending,
          correlationId: pending?.correlationId,
          hasValue: true,
          value: "hold",
        }),
      );

      // ── 3a. A STALE decision reply (authored for an ask that is not the pending one) lands
      // first. The reactor must ignore it and leave the ask pending — the staleness pin is
      // authoritative at the consume point, not just at the route's peek. ──
      yield* orchestration.dispatch({
        type: "thread.message.upsert",
        commandId: CommandId.make("decision-stale-reply"),
        threadId: ThreadId.make(launchThreadId),
        message: {
          messageId: MessageId.make("decision-stale-reply-msg"),
          role: "user",
          text: "ship-now",
          turnId: null,
          streaming: false,
          t3workExt: { workflowReply: { value: "ship-now", correlationId: "decision-run:999" } },
        },
        createdAt: ISO,
      });

      // ── 3b. The route-shaped reply (display text + structured workflowReply pinned to the
      // pending ask) lands as a real domain event; the REAL reactor resolves with the
      // structured value. Completing with "hold" proves the stale "ship-now" was ignored AND
      // the pending ask was re-registered. ──
      yield* orchestration.dispatch({
        type: "thread.message.upsert",
        commandId: CommandId.make("decision-user-reply"),
        threadId: ThreadId.make(launchThreadId),
        message: {
          messageId: MessageId.make("decision-user-reply-msg"),
          role: "user",
          text: "hold",
          turnId: null,
          streaming: false,
          t3workExt: {
            workflowReply: { value: "hold", correlationId: pending?.correlationId ?? "" },
          },
        },
        createdAt: ISO,
      });

      yield* waitUntil(() => completed.length > 0, "run to complete after the decision click");

      assert.deepStrictEqual(completed[0], { decision: "hold" });
      assert.isUndefined(registry.getRun(runId));
    }).pipe(Effect.provide(TestLayer)),
);

afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));
