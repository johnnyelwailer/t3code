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
 * The connect-credential minter and the broker are the server's shared ones (server.ts). This
 * instance never dispatches: `start` stays absent until a delegated child runs on the session.
 */
import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

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

export class DelegateCloudSessionPlacement extends Context.Service<
  DelegateCloudSessionPlacement,
  DelegateCloudSessions
>()("t3/t3team-delegateTaskCloudSessionLayer/DelegateCloudSessionPlacement") {}

const noBroker = new CloudSessionFailedError({
  reason: "broker_unavailable",
  message:
    "This build has no Nexi broker configured, and a server reaches a cloud session only through it.",
});

export const makeDelegateCloudSessionPlacement = Effect.gen(function* () {
  const sessions = yield* CloudSessionService;
  const broker = yield* NexiBrokerService;
  return {
    list: sessions.list,
    brokerReady: broker.enabled ? Effect.asVoid(broker.sessions) : Effect.fail(noBroker),
    startGuard: yield* makeCloudSessionStartGuard(),
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
