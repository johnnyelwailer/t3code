/**
 * Cloud sessions for delegate_task's `cloudSession` extension (flag `DELEGATE_CLOUD`, read once at
 * startup). Off: nothing is built, the hook finds no `DelegateCloudSessionPlacement` and does not
 * offer the extension.
 *
 * On, the hook gets its OWN `CloudSessionService`, built from the same layers every WebSocket
 * connection builds its own from (ws.ts, inside the `/ws` handler); no server-lifetime instance
 * exists to share without moving that one out of ws.ts. Per instance, as for every connection
 * today: the standby claim ledger (only used by project machines), the payload-issue cleanup
 * tracker, the list single-flight, and a fresh `CloudCliTokenManager` with its own semaphore.
 * The connect-credential minter and the broker are the server's shared ones (server.ts). The
 * placement also has its own broker connector (one more pairing per session than the
 * `remoteEnvironment` driver's), used only to probe a ready session before a child is placed.
 */
import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpClient } from "effect/http";

import * as CloudCliTokenManager from "./cloud/CliTokenManager.ts";
import { layer as CloudSessionMachinesLayer } from "./cloud/t3team-CloudSessionMachine.ts";
import {
  CloudSessionService,
  layer as CloudSessionServiceLayer,
} from "./cloud/t3team-CloudSessionService.ts";
import { NexiBrokerService } from "./cloud/t3team-NexiBrokerService.ts";
import { layer as ProjectMachineDiscoveryLayer } from "./project/t3team-ProjectMachineDiscovery.ts";
import type { DelegateCloudSessions } from "./t3team-delegateTaskCloudSession.ts";
import { makeCloudSessionStartGuard } from "./t3team-delegateTaskCloudSessionStartGuard.ts";
import { readFeatureFlagFromConfig } from "./t3team-featureFlagConfig.ts";
import { makeCloudSessionConnector } from "./cloud/t3team-cloudSessionConnector.ts";
import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import {
  DEFAULT_CHILDREN_PER_SESSION,
  makeCloudSessionCapacity,
} from "./t3team-delegateCloudCapacity.ts";
import { openRemoteEnvironmentApi } from "./t3team-remoteEnvironmentApi.ts";
import { checkRemoteTarget } from "./t3team-remoteEnvironmentPrepare.ts";

export class DelegateCloudSessionPlacement extends Context.Service<
  DelegateCloudSessionPlacement,
  DelegateCloudSessions
>()("t3/t3team-delegateTaskCloudSessionLayer/DelegateCloudSessionPlacement") {}

const noBroker = new CloudSessionFailedError({
  reason: "broker_unavailable",
  message:
    "This build has no Nexi broker configured, and a server reaches a cloud session only through it.",
});

/** A delegated child's session holds its machine this long, not the 345-minute ceiling. */
export const DELEGATED_SESSION_HOLD_SECONDS = 2 * 60 * 60;

export const makeDelegateCloudSessionPlacement = Effect.gen(function* () {
  const sessions = yield* CloudSessionService;
  const broker = yield* NexiBrokerService;
  const http = yield* HttpClient.HttpClient;
  const threads = yield* ThreadManagementService;
  const limit = yield* Config.Int("NEXI_DELEGATE_CLOUD_CHILDREN_PER_SESSION").pipe(
    Config.withDefault(DEFAULT_CHILDREN_PER_SESSION),
  );
  const connector = yield* makeCloudSessionConnector(broker);
  return {
    list: sessions.list,
    brokerReady: broker.enabled ? Effect.asVoid(broker.sessions) : Effect.fail(noBroker),
    start: (projectId) =>
      sessions.create({ durationSeconds: DELEGATED_SESSION_HOLD_SECONDS, projectId }),
    probe: (sessionId, target) =>
      Effect.scoped(
        connector.connect(sessionId).pipe(
          Effect.flatMap(openRemoteEnvironmentApi),
          Effect.flatMap((api) => checkRemoteTarget(api, target)),
          Effect.asVoid,
        ),
      ).pipe(Effect.provideService(HttpClient.HttpClient, http)),
    startGuard: yield* makeCloudSessionStartGuard(),
    capacity: yield* makeCloudSessionCapacity({
      limit: Math.max(1, limit),
      isActive: (threadId) =>
        threads.getThreadShell(threadId).pipe(
          Effect.map(
            (shell) =>
              shell !== null && (shell.activeRunId !== null || !shell.latestRunCompletedAt),
          ),
          Effect.orElseSucceed(() => false),
        ),
    }),
  } satisfies DelegateCloudSessions;
});

export const delegateCloudSessionPlacementLayer = Layer.effect(
  DelegateCloudSessionPlacement,
  makeDelegateCloudSessionPlacement,
);

const placement = delegateCloudSessionPlacementLayer.pipe(
  Layer.provide(CloudSessionServiceLayer),
  Layer.provide(CloudCliTokenManager.layer),
  Layer.provide(CloudSessionMachinesLayer),
  Layer.provide(ProjectMachineDiscoveryLayer),
);

/** `placementLayer` when the flag is on, else nothing. */
export const whenDelegateCloudEnabled = <E, R>(
  placementLayer: Layer.Layer<DelegateCloudSessionPlacement, E, R>,
) =>
  Layer.unwrap(
    Effect.map(readFeatureFlagFromConfig("DELEGATE_CLOUD"), (enabled) =>
      enabled ? placementLayer : Layer.empty,
    ),
  );

export const T3TeamDelegateCloudSessionsLayer = whenDelegateCloudEnabled(placement);
