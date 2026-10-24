/**
 * Cloud sessions for delegate_task's `cloudSession` extension (flag `DELEGATE_CLOUD`, read once at
 * startup). On, the delegation hook gets its own `CloudSessionService`, built from the same layers
 * every WebSocket connection builds its own from (ws.ts); off, nothing is built and the hook does
 * not offer the extension.
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as CloudCliTokenManager from "./cloud/CliTokenManager.ts";
import { layer as CloudSessionMachinesLayer } from "./cloud/t3team-CloudSessionMachine.ts";
import { layer as CloudSessionServiceLayer } from "./cloud/t3team-CloudSessionService.ts";
import { layer as ProjectMachineDiscoveryLayer } from "./project/t3team-ProjectMachineDiscovery.ts";
import { readFeatureFlagFromConfig } from "./t3team-featureFlagConfig.ts";

const cloudSessions = CloudSessionServiceLayer.pipe(
  Layer.provide(CloudCliTokenManager.layer),
  Layer.provide(CloudSessionMachinesLayer),
  Layer.provide(ProjectMachineDiscoveryLayer),
);

export const T3TeamDelegateCloudSessionsLayer = Layer.unwrap(
  Effect.gen(function* () {
    const enabled = yield* readFeatureFlagFromConfig("DELEGATE_CLOUD");
    return enabled ? cloudSessions : Layer.empty;
  }),
);
