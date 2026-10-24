/**
 * The `remoteEnvironment` orchestration adapter for one instance: capabilities, turn-scoped
 * selection changes, and sessions that run their turns on cloud sessions
 * (`t3team-remoteEnvironmentSession.ts`).
 */
import type { ProviderInstanceId } from "@t3tools/contracts";
import type {
  ProviderAdapterV2,
  ProviderAdapterV2OpenSessionInput,
} from "@t3tools/provider-core/server/ProviderAdapter";
import { turnScopedSelectionTransition } from "@t3tools/provider-core/server/selectionTransition";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { RemoteEnvironmentSessionDeps } from "./t3team-remoteEnvironmentApiTypes.ts";
import {
  REMOTE_ENVIRONMENT_CAPABILITIES,
  remoteEnvironmentProviderSession,
} from "./t3team-remoteEnvironmentCapabilities.ts";
import { makeRemoteEnvironmentSession } from "./t3team-remoteEnvironmentSession.ts";
import { REMOTE_ENVIRONMENT_DRIVER } from "./t3team-remoteEnvironmentTurn.ts";

export const makeRemoteEnvironmentAdapter = (
  instanceId: ProviderInstanceId,
  deps: RemoteEnvironmentSessionDeps,
): ProviderAdapterV2["Service"] => ({
  instanceId,
  driver: REMOTE_ENVIRONMENT_DRIVER,
  getCapabilities: () => Effect.succeed(REMOTE_ENVIRONMENT_CAPABILITIES),
  planSelectionTransition: () => Effect.succeed(turnScopedSelectionTransition()),
  openSession: Effect.fn("RemoteEnvironmentAdapter.openSession")(function* (
    value: ProviderAdapterV2OpenSessionInput,
  ) {
    const providerSession = remoteEnvironmentProviderSession({
      providerSessionId: value.providerSessionId,
      instanceId,
      cwd: value.runtimePolicy.cwd ?? "/",
      now: yield* DateTime.now,
    });
    return yield* makeRemoteEnvironmentSession(deps, {
      instanceId,
      providerSessionId: value.providerSessionId,
      providerSession,
    });
  }),
});
