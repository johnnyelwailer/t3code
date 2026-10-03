import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import {
  EnvironmentId,
  NodeId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  RunId,
  ThreadId,
  type OrchestrationV2ThreadProjection,
  type ServerProvider,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

import type { ProviderAdapterV2Shape } from "../orchestration-v2/ProviderAdapter.ts";
import * as ProviderAdapterRegistry from "../orchestration-v2/ProviderAdapterRegistry.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import * as ProviderRegistry from "../provider/Services/ProviderRegistry.ts";
import * as ScheduledTaskService from "../scheduledTasks/ScheduledTaskService.ts";
import type { McpInvocationScope } from "./McpInvocationContext.ts";
import * as OrchestratorMcpService from "./OrchestratorMcpService.ts";
import {
  DelegatedTaskPreparation,
  defaultDelegatedTaskPreparation,
  rejectUnsupportedDelegationInput,
} from "./t3team-delegatedTaskPreparation.ts";

const parentThreadId = ThreadId.make("thread:prep-parent");
const childThreadId = ThreadId.make("thread:prep-child");
const parentRunId = RunId.make("run:prep-parent");
const parentNodeId = NodeId.make("node:prep-root");
const taskId = NodeId.make("node:prep-task");
const instanceId = ProviderInstanceId.make("codex");
const modelSelection = { instanceId, model: "gpt-5.4" };

const scope: McpInvocationScope = {
  environmentId: EnvironmentId.make("environment:prep"),
  threadId: parentThreadId,
  providerSessionId: "provider-session:prep",
  providerInstanceId: instanceId,
  capabilities: new Set(["orchestration"]),
  issuedAt: 1,
};

const provider: ServerProvider = {
  instanceId,
  driver: ProviderDriverKind.make("codex"),
  enabled: true,
  installed: true,
  version: "test",
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: "2026-10-03T00:00:00.000Z",
  models: [{ slug: "gpt-5.4", name: "gpt-5.4", isCustom: false, capabilities: null }],
  slashCommands: [],
  skills: [],
};

const task = {
  id: taskId,
  threadId: parentThreadId,
  runId: parentRunId,
  parentNodeId,
  origin: "app_owned",
  createdBy: "agent",
  driver: ProviderDriverKind.make("codex"),
  providerInstanceId: instanceId,
  providerThreadId: null,
  childThreadId,
  nativeTaskRef: null,
  prompt: "Fix the bug.",
  title: null,
  model: "gpt-5.4",
  status: "running",
  result: null,
  startedAt: null,
  completedAt: null,
};

const parentProjection = (subagents: ReadonlyArray<unknown>) =>
  ({
    thread: {
      id: parentThreadId,
      projectId: ProjectId.make("project:prep"),
      title: "Parent",
      createdBy: "user",
      creationSource: "web",
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
    },
    runs: [
      {
        id: parentRunId,
        ordinal: 1,
        status: "running",
        rootNodeId: parentNodeId,
        providerInstanceId: instanceId,
        modelSelection,
      },
    ],
    contextTransfers: [],
    subagents,
  }) as unknown as OrchestrationV2ThreadProjection;

const childProjection = {
  thread: { id: childThreadId },
  runs: [],
  contextTransfers: [],
  messages: [],
  subagents: [],
  providerThreads: [],
  turnItems: [],
} as unknown as OrchestrationV2ThreadProjection;

const makeDependencies = (dispatched: Ref.Ref<ReadonlyArray<unknown>>) => {
  let delegated = false;
  return Layer.mergeAll(
    NodeServices.layer,
    Layer.mock(ThreadManagementService.ThreadManagementService)({
      getThreadRecords: (threadId) =>
        Effect.succeed(
          threadId === parentThreadId ? parentProjection(delegated ? [task] : []) : childProjection,
        ),
      dispatch: (command) =>
        Ref.update(dispatched, (commands) => [...commands, command]).pipe(
          Effect.andThen(Effect.sync(() => void (delegated = true))),
          Effect.as({
            sequence: 1,
            storedEvents: [
              { sequence: 1, commandId: null, event: { type: "subagent.updated", payload: task } },
            ],
          } as never),
        ),
    }),
    Layer.mock(ProviderRegistry.ProviderRegistry)({ getProviders: Effect.succeed([provider]) }),
    Layer.succeed(
      ProviderAdapterRegistry.ProviderAdapterRegistryV2,
      ProviderAdapterRegistry.ProviderAdapterRegistryV2.of({
        list: () => Effect.succeed([instanceId]),
        get: () => Effect.succeed({ instanceId } as unknown as ProviderAdapterV2Shape),
      }),
    ),
    Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
  );
};

describe("rejectUnsupportedDelegationInput", () => {
  it.effect("accepts the core inputs and rejects what the host cannot honour", () =>
    Effect.gen(function* () {
      const supported = { workspaceIsolation: false, extensions: [] };
      yield* rejectUnsupportedDelegationInput({ workspace: undefined, extensions: {} }, supported);
      yield* rejectUnsupportedDelegationInput(
        { workspace: { isolation: "inherit" }, extensions: undefined },
        supported,
      );
      const worktree = yield* rejectUnsupportedDelegationInput(
        { workspace: { isolation: "worktree" }, extensions: undefined },
        supported,
      ).pipe(Effect.flip);
      assert.equal(worktree.code, "invalid_request");
      const inheritWithRepo = yield* rejectUnsupportedDelegationInput(
        { workspace: { isolation: "inherit", repository: "o/r" }, extensions: undefined },
        { workspaceIsolation: true, extensions: [] },
      ).pipe(Effect.flip);
      assert.include(inheritWithRepo.message, "need isolation=worktree");
      const unknownKey = yield* rejectUnsupportedDelegationInput(
        { workspace: undefined, extensions: { effort: "high", color: "red" } },
        { workspaceIsolation: true, extensions: [{ key: "effort", description: "" }] },
      ).pipe(Effect.flip);
      assert.include(unknownKey.message, "color");
      assert.include(unknownKey.message, "accepted: effort");
    }),
  );
});

describe("OrchestratorMcpService delegateTask preparation hook", () => {
  it.effect("without a host hook, worktree isolation fails before anything is dispatched", () =>
    Effect.gen(function* () {
      const dispatched = yield* Ref.make<ReadonlyArray<unknown>>([]);
      yield* Effect.gen(function* () {
        const service = yield* OrchestratorMcpService.OrchestratorMcpService;
        const failure = yield* service
          .delegateTask(scope, { task: "Fix the bug.", workspace: { isolation: "worktree" } })
          .pipe(Effect.flip);
        assert.equal(failure.code, "invalid_request");
        assert.equal((yield* Ref.get(dispatched)).length, 0);
        const capabilities = yield* service.capabilities(scope);
        assert.isUndefined(capabilities.delegation);
      }).pipe(
        Effect.provide(
          OrchestratorMcpService.layer.pipe(Layer.provide(makeDependencies(dispatched))),
        ),
      );
    }),
  );

  it.effect("applies the host's model, workspace and notes, then runs afterCreate", () =>
    Effect.gen(function* () {
      const dispatched = yield* Ref.make<ReadonlyArray<unknown>>([]);
      const created = yield* Ref.make<ReadonlyArray<string>>([]);
      const preparation = Layer.succeed(DelegatedTaskPreparation, {
        workspaceIsolation: true,
        extensions: [{ key: "effort", description: "tier" }],
        prepare: (input) =>
          Effect.succeed({
            modelSelection: { ...input.modelSelection, model: "gpt-5.4-high" },
            workspace: { branch: "child-branch", worktreePath: "/tmp/child" },
            notes: [`prepared ${String(input.extensions?.effort)}`],
            afterCreate: (id) =>
              Ref.update(created, (ids) => [...ids, id]).pipe(Effect.as(["after create"])),
          }),
      });
      yield* Effect.gen(function* () {
        const service = yield* OrchestratorMcpService.OrchestratorMcpService;
        const result = yield* service.delegateTask(scope, {
          task: "Fix the bug.",
          workspace: { isolation: "worktree" },
          extensions: { effort: "high" },
        });
        assert.deepEqual(result.notes, ["prepared high", "after create"]);
        assert.deepEqual(yield* Ref.get(created), [childThreadId]);
        const [request] = (yield* Ref.get(dispatched)) as ReadonlyArray<{
          readonly type: string;
          readonly modelSelection: { readonly model: string };
          readonly workspace?: { readonly branch: string; readonly worktreePath: string };
        }>;
        assert.equal(request?.type, "delegated_task.request");
        assert.equal(request?.modelSelection.model, "gpt-5.4-high");
        assert.deepEqual(request?.workspace, {
          branch: "child-branch",
          worktreePath: "/tmp/child",
        });
        const capabilities = yield* service.capabilities(scope);
        assert.deepEqual(capabilities.delegation, {
          workspaceIsolation: true,
          extensions: [{ key: "effort", description: "tier" }],
        });
      }).pipe(
        Effect.provide(
          OrchestratorMcpService.layer.pipe(
            Layer.provide(makeDependencies(dispatched)),
            Layer.provide(preparation),
          ),
        ),
      );
    }),
  );

  it("the default hook keeps the resolved model and adds nothing", () => {
    assert.equal(defaultDelegatedTaskPreparation.workspaceIsolation, false);
    assert.deepEqual(defaultDelegatedTaskPreparation.extensions, []);
  });
});
