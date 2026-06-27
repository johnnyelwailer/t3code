/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Legacy async tests intentionally bridge Effect runtimes; tracked cleanup is separate from upstream green gate. */
// @effect-diagnostics nodeBuiltinImport:off - integration test reads workflow fixtures + temp dir.
/**
 * Real-path proof for the `boolean` and `form` askUser decision affordances (Epic 25 §askUser
 * decision cards), sibling of `t3work-workflowEngineDecisionCard.integration.test.ts`: REAL
 * OrchestrationEngine + projection pipeline + the production `T3workWorkflowEngineReactorLive`
 * over `SqlitePersistenceMemory`.
 *
 * Each case: launch → `askUser` suspends on `user.input`, and the escalation carries the
 * `workflow.decision` view with the right affordance → the resolve route's value check rejects an
 * invalid value and accepts a valid one against the LIVE pending state → the route-shaped reply
 * (structured `workflowReply`) lands as a domain event → the REAL reactor resolves the parked ask
 * with the STRUCTURED value → the run completes with the schema-validated reply.
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
import type { AskAffordance } from "@t3work/sdk";
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
  type T3workWorkflowEngineRegistryShape,
} from "./t3work-workflowEngineRegistry.ts";
import { rejectWorkflowResolveValue } from "./t3work-workflowResolveInput.ts";

const fixture = (name: string): string =>
  NodeURL.fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url));
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3work-decision-aff-"));

const projectId = ProjectId.make("proj-decision-aff");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const ISO = "2026-06-09T00:00:00.000Z";

const EngineLive = OrchestrationEngineLive.pipe(
  Layer.provide(OrchestrationProjectionSnapshotQueryLive),
  Layer.provide(OrchestrationProjectionPipelineLive),
  Layer.provide(OrchestrationEventStoreLive),
  Layer.provide(OrchestrationCommandReceiptRepositoryLive),
  Layer.provide(RepositoryIdentityResolver.layer),
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "t3-wf-decision-aff-" })),
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

/** Launch a fixture workflow on a fresh project + thread, suspend on its first askUser, and hand
 * back the live state the assertions drive (pending ask, the escalation upsert, completion sink). */
const launchSuspended = (input: {
  readonly key: string;
  readonly workflow: string;
  readonly orchestration: typeof OrchestrationEngineService.Service;
  readonly registry: T3workWorkflowEngineRegistryShape;
}) =>
  Effect.gen(function* () {
    const { key, orchestration, registry } = input;
    const runId = `${key}-run`;
    const launchThreadId = `${key}-launch`;
    const args = { question: `Decision for ${key}?` };

    yield* orchestration.dispatch({
      type: "project.create",
      commandId: CommandId.make(`${key}-project`),
      projectId,
      title: "Decision Affordances",
      workspaceRoot: "/tmp/decision-aff",
      defaultModelSelection: modelSelection,
      createdAt: ISO,
    });
    yield* orchestration.dispatch({
      type: "thread.create",
      commandId: CommandId.make(`${key}-launch-thread`),
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

    const launched = yield* Effect.promise(() =>
      launchWorkflowRecipe({
        runId,
        workflowPath: fixture(input.workflow),
        args,
        runsRoot,
        launchThreadId,
        projectId,
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        registry,
        dispatch,
        newId: () => `${key}-id-${(seq += 1)}`,
        nowIso: () => ISO,
        onComplete: async (output) => {
          completed.push(output);
        },
      }),
    );
    assert.strictEqual(launched.status, "suspended");

    const upsert = dispatched.find((command) => command.type === "thread.message.upsert");
    if (upsert?.type !== "thread.message.upsert") throw new Error("expected an escalation upsert");
    const ext: T3workMessageExt | undefined = upsert.message.t3workExt;
    assert.strictEqual(ext?.status, "waiting-for-input");
    const view = ext?.attachments?.[0];
    if (view?.kind !== "view") throw new Error("expected a decision view attachment");
    assert.strictEqual(view.miniappId, PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION);

    return {
      runId,
      launchThreadId,
      args,
      completed,
      pending: registry.peekPending(launchThreadId),
      viewAffordance: view.props["affordance"],
    };
  });

it.live(
  "boolean askUser: suspend emits a boolean affordance (with labels), the value check gates true/false, and a structured reply resumes",
  () =>
    Effect.gen(function* () {
      const orchestration = yield* OrchestrationEngineService;
      const registry = yield* T3workWorkflowEngineRegistry;
      yield* Effect.sleep(Duration.millis(100)); // let the forked reactor subscribe first

      const run = yield* launchSuspended({
        key: "boolean",
        workflow: "t3work-decisionBoolean.workflow.ts",
        orchestration,
        registry,
      });

      const expectedAffordance: AskAffordance = {
        kind: "boolean",
        labels: { true: "Ship it", false: "Hold" },
      };
      assert.deepStrictEqual(run.pending?.affordance, expectedAffordance);
      assert.deepStrictEqual(run.viewAffordance, expectedAffordance);

      // A non-boolean structured value is rejected; an actual boolean passes.
      assert.isNotNull(
        rejectWorkflowResolveValue({
          pending: run.pending,
          correlationId: run.pending?.correlationId,
          hasValue: true,
          value: "yes",
        }),
      );
      assert.isNull(
        rejectWorkflowResolveValue({
          pending: run.pending,
          correlationId: run.pending?.correlationId,
          hasValue: true,
          value: true,
        }),
      );

      yield* orchestration.dispatch({
        type: "thread.message.upsert",
        commandId: CommandId.make("boolean-user-reply"),
        threadId: ThreadId.make(run.launchThreadId),
        message: {
          messageId: MessageId.make("boolean-user-reply-msg"),
          role: "user",
          text: "Ship it",
          turnId: null,
          streaming: false,
          t3workExt: {
            workflowReply: { value: true, correlationId: run.pending?.correlationId ?? "" },
          },
        },
        createdAt: ISO,
      });

      yield* waitUntil(() => run.completed.length > 0, "boolean run to complete");
      assert.deepStrictEqual(run.completed[0], { approved: true });
      assert.isUndefined(registry.getRun(run.runId));
    }).pipe(Effect.provide(TestLayer)),
);

it.live(
  "form askUser: suspend emits a form affordance, the value check gates field types/ranges, and a structured object reply resumes",
  () =>
    Effect.gen(function* () {
      const orchestration = yield* OrchestrationEngineService;
      const registry = yield* T3workWorkflowEngineRegistry;
      yield* Effect.sleep(Duration.millis(100));

      const run = yield* launchSuspended({
        key: "form",
        workflow: "t3work-decisionForm.workflow.ts",
        orchestration,
        registry,
      });

      const expectedAffordance: AskAffordance = {
        kind: "form",
        fields: [
          { name: "severity", type: "literals", options: ["low", "high"], optional: false },
          { name: "note", type: "string", optional: false },
          { name: "urgent", type: "boolean", optional: false },
        ],
      };
      assert.deepStrictEqual(run.pending?.affordance, expectedAffordance);
      assert.deepStrictEqual(run.viewAffordance, expectedAffordance);

      const reject = (value: unknown) =>
        rejectWorkflowResolveValue({
          pending: run.pending,
          correlationId: run.pending?.correlationId,
          hasValue: true,
          value,
        });
      // Out-of-range literal, missing required field, and wrong scalar type are all rejected.
      assert.isNotNull(reject({ severity: "nope", note: "x", urgent: true }));
      assert.isNotNull(reject({ severity: "high", note: "x" }));
      assert.isNotNull(reject({ severity: "high", note: "x", urgent: "yes" }));
      const valid = { severity: "high", note: "rounding bug", urgent: true };
      assert.isNull(reject(valid));

      yield* orchestration.dispatch({
        type: "thread.message.upsert",
        commandId: CommandId.make("form-user-reply"),
        threadId: ThreadId.make(run.launchThreadId),
        message: {
          messageId: MessageId.make("form-user-reply-msg"),
          role: "user",
          text: "severity: high, note: rounding bug, urgent: true",
          turnId: null,
          streaming: false,
          t3workExt: {
            workflowReply: { value: valid, correlationId: run.pending?.correlationId ?? "" },
          },
        },
        createdAt: ISO,
      });

      yield* waitUntil(() => run.completed.length > 0, "form run to complete");
      assert.deepStrictEqual(run.completed[0], valid);
      assert.isUndefined(registry.getRun(run.runId));
    }).pipe(Effect.provide(TestLayer)),
);

afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));
