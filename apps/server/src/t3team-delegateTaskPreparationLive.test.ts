import { assert, describe, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { type CloudSession, EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { GitWorkflowService } from "./git/GitWorkflowService.ts";
import { DelegatedTaskPreparation } from "./mcp/t3team-delegatedTaskPreparation.ts";
import { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import { ProjectSetupScriptRunner } from "./project/ProjectSetupScriptRunner.ts";
import { ProviderRegistry } from "./provider/ProviderRegistry.ts";
import { SourceControlProviderRegistry } from "./sourceControl/SourceControlProviderRegistry.ts";
import { T3TeamChildThreadMetadata } from "./t3team-childThreadMetadata.ts";
import { fakeCloudSessions } from "./t3team-delegateCloud.fixtures.ts";
import { DelegateCloudSessionPlacement } from "./t3team-delegateTaskCloudSessionLayer.ts";
import { T3TeamDelegatedTaskPreparationLive } from "./t3team-delegateTaskPreparationLive.ts";
import { T3TeamLinkedRepositorySync } from "./t3team-linkedRepositorySync.ts";
import { turnInputJson } from "./t3team-pack-driver.fixtures.ts";
import { PackCodec } from "./t3team-pack-driverCodec.ts";
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

const services = Layer.mergeAll(
  NodeServices.layer,
  Layer.mock(GitWorkflowService)({}),
  Layer.mock(SourceControlProviderRegistry)({ resolveLink: () => undefined }),
  Layer.mock(T3TeamLinkedRepositorySync)({ phase: () => undefined }),
  Layer.mock(ProjectSetupScriptRunner)({}),
  Layer.mock(ProviderRegistry)({ getProviders: Effect.succeed([]) }),
  Layer.mock(ProjectStoreV2)({ getShell: () => Effect.die(new Error("project lookup died")) }),
  Layer.mock(T3TeamChildThreadMetadata)({ upsert: () => Effect.void }),
  Layer.mock(T3TeamThreadFactsStore)({}),
);

const placement = Layer.effect(
  DelegateCloudSessionPlacement,
  Effect.map(fakeCloudSessions({ sessions: [ready] }), ({ sessions }) => sessions),
);

const hook = (withPlacement: boolean) =>
  T3TeamDelegatedTaskPreparationLive.pipe(
    Layer.provide(withPlacement ? Layer.merge(services, placement) : services),
  );

const prepareInput = (extensions: Readonly<Record<string, unknown>> | undefined) => ({
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
    }).pipe(Effect.provide(hook(false))),
  );

  it.effect(
    "a project lookup that dies fails the delegation with a reason, before any child exists",
    () =>
      Effect.gen(function* () {
        const preparation = yield* DelegatedTaskPreparation;
        assert.isTrue(preparation.extensions.some((option) => option.key === "cloudSession"));
        const refused = yield* Effect.flip(
          preparation.prepare(prepareInput({ cloudSession: "auto" })),
        );
        assert.strictEqual(refused.code, "orchestration_error");
        assert.match(refused.message, /Could not read the child's project/);
      }).pipe(Effect.provide(hook(true))),
  );
});
