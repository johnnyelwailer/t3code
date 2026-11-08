import { assert, describe, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  type CloudSession,
  EnvironmentId,
  type OrchestrationProjectShell,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

import { GitWorkflowService } from "./git/GitWorkflowService.ts";
import { DelegatedTaskPreparation } from "./mcp/t3team-delegatedTaskPreparation.ts";
import { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import { ProjectSetupScriptRunner } from "./project/ProjectSetupScriptRunner.ts";
import { ProviderRegistry } from "./provider/ProviderRegistry.ts";
import { SourceControlProviderRegistry } from "./sourceControl/SourceControlProviderRegistry.ts";
import { T3TeamChildThreadMetadata } from "./t3team-childThreadMetadata.ts";
import { makeMemoryCloudChildPlacementMarkers } from "./t3team-cloudChildPlacementMarkers.ts";
import { fakeCloudSessions } from "./t3team-delegateCloud.fixtures.ts";
import type { DelegateCloudSessions } from "./t3team-delegateTaskCloudTypes.ts";
import { DelegateCloudSessionPlacement } from "./t3team-delegateTaskCloudSessionLayer.ts";
import { T3TeamDelegatedTaskPreparationLive } from "./t3team-delegateTaskPreparationLive.ts";
import { T3TeamLinkedRepositorySync } from "./t3team-linkedRepositorySync.ts";
import { turnInputJson } from "./t3team-pack-driver.fixtures.ts";
import { PackCodec } from "./t3team-pack-driverCodec.ts";
import { T3TeamThreadToolContextStore } from "./t3team-threadToolContextStore.ts";
import { T3TeamThreadFactsStore } from "./t3team-v2/t3team-threadFactsStore.ts";

const parentThread = Schema.decodeUnknownSync(PackCodec.turnInput)(
  turnInputJson("thread-parent", "session-1"),
).appThread;

const ready: CloudSession = {
  sessionId: "41",
  providerKind: "github_actions",
  phase: "ready",
  elapsedSeconds: 60,
  name: "nexi-machine-qa",
  remainingSeconds: 3600,
  machineLabel: "ubuntu",
  failureReason: null,
  detailsUrl: null,
  environmentId: "env-41",
  transport: "nexi_broker",
};

const project: OrchestrationProjectShell = {
  id: parentThread.projectId,
  title: "nexi-machine-qa",
  workspaceRoot: "/work/nexi-machine-qa",
  repositoryIdentity: {
    canonicalKey: "nexplore.ghe.com/pj/nexi-machine-qa",
    locator: { source: "git-remote", remoteName: "origin", remoteUrl: "https://x/qa" },
    name: "nexi-machine-qa",
  },
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-10-25T00:00:00.000Z",
  updatedAt: "2026-10-25T00:00:00.000Z",
};

const services = (projectLookupDies: boolean) =>
  Layer.mergeAll(
    NodeServices.layer,
    Layer.mock(GitWorkflowService)({}),
    Layer.mock(SourceControlProviderRegistry)({ resolveLink: () => undefined }),
    Layer.mock(T3TeamLinkedRepositorySync)({ phase: () => undefined }),
    Layer.mock(ProjectSetupScriptRunner)({}),
    Layer.mock(ProviderRegistry)({ getProviders: Effect.succeed([]) }),
    Layer.mock(ProjectStoreV2)({
      getShell: () =>
        projectLookupDies
          ? Effect.die(new Error("project lookup died"))
          : Effect.succeed(Option.some(project)),
    }),
    Layer.mock(T3TeamChildThreadMetadata)({
      upsert: () => Effect.die(new Error("child metadata write died")),
    }),
    Layer.mock(T3TeamThreadFactsStore)({}),
    Layer.mock(T3TeamThreadToolContextStore)({
      get: () => Effect.die(new Error("tool context read died")),
    }),
  );

const hook = (placement: DelegateCloudSessions | undefined, projectLookupDies = true) =>
  T3TeamDelegatedTaskPreparationLive.pipe(
    Layer.provide(
      placement === undefined
        ? services(projectLookupDies)
        : Layer.merge(
            services(projectLookupDies),
            Layer.succeed(DelegateCloudSessionPlacement, placement),
          ),
    ),
  );

const prepareInput = (
  extensions: Readonly<Record<string, unknown>> | undefined,
  acceptedChildThreadId?: ThreadId,
) => ({
  scope: {
    environmentId: EnvironmentId.make("env-local"),
    capabilities: new Set<never>(),
    issuedAt: 0,
    requestNamespace: "test",
    thread: undefined,
    client: undefined,
  },
  parentThread,
  requestKey: "request-1",
  title: "child",
  modelSelection: { instanceId: ProviderInstanceId.make("nexplore"), model: "low" },
  explicitTargetOptions: false,
  workspace: undefined,
  extensions,
  acceptedChildThreadId,
});

describe("T3TeamDelegatedTaskPreparationLive cloudSession wiring", () => {
  it.effect("does not offer or accept cloudSession without the placement (flag off)", () =>
    Effect.gen(function* () {
      const preparation = yield* DelegatedTaskPreparation;
      assert.isFalse(preparation.extensions.some((option) => option.key === "cloudSession"));
      const refused = yield* Effect.flip(
        preparation.prepare(prepareInput({ cloudSession: "auto" })),
      );
      assert.strictEqual(refused.code, "invalid_request");
    }).pipe(Effect.provide(hook(undefined))),
  );

  it.effect("a dying project lookup fails the delegation with a reason, before any child", () =>
    Effect.gen(function* () {
      const { sessions } = yield* fakeCloudSessions({ sessions: [ready] });
      yield* Effect.gen(function* () {
        const preparation = yield* DelegatedTaskPreparation;
        assert.isTrue(preparation.extensions.some((option) => option.key === "cloudSession"));
        const refused = yield* Effect.flip(
          preparation.prepare(prepareInput({ cloudSession: "auto" })),
        );
        assert.strictEqual(refused.code, "orchestration_error");
        assert.match(refused.message, /Could not read the child's project/);
      }).pipe(Effect.provide(hook(sessions)));
    }),
  );

  it.effect("registers the placed child even when recording the child dies", () =>
    Effect.gen(function* () {
      const { sessions } = yield* fakeCloudSessions({ sessions: [ready] });
      const child = ThreadId.make("thread-child");
      yield* Effect.gen(function* () {
        const preparation = yield* DelegatedTaskPreparation;
        const prepared = yield* preparation.prepare(prepareInput({ cloudSession: "auto" }));
        yield* Effect.exit(prepared.afterCreate(child));
      }).pipe(Effect.provide(hook(sessions, false)));
      assert.deepStrictEqual(yield* sessions.placements.lookup(child, "1 millis"), {
        sessionId: "41",
        repositoryKey: "nexplore.ghe.com/pj/nexi-machine-qa",
      });
    }),
  );

  it.effect("a retried accepted delegation after a restart starts no second session", () =>
    Effect.gen(function* () {
      const markers = yield* makeMemoryCloudChildPlacementMarkers;
      const child = ThreadId.make("thread-child");
      const before = yield* fakeCloudSessions({ markers });
      yield* Effect.gen(function* () {
        const preparation = yield* DelegatedTaskPreparation;
        const prepared = yield* preparation.prepare(prepareInput({ cloudSession: "new" }));
        yield* Effect.exit(prepared.afterCreate(child));
      }).pipe(Effect.provide(hook(before.sessions, false)));
      const after = yield* fakeCloudSessions({ markers, limit: 1 });
      yield* Effect.gen(function* () {
        const preparation = yield* DelegatedTaskPreparation;
        const retried = yield* preparation.prepare(prepareInput({ cloudSession: "new" }, child));
        yield* retried.afterReplay ?? Effect.void;
        assert.isTrue(
          retried.notes.some((note) => /already exists on cloud session 99/.test(note)),
        );
      }).pipe(Effect.provide(hook(after.sessions, false)));
      assert.strictEqual(yield* Ref.get(before.starts), 1);
      assert.strictEqual(yield* Ref.get(after.starts), 0);
      assert.isTrue(yield* after.sessions.capacity.tryReserve("next", "99"));
    }),
  );
});
