/**
 * The `remoteEnvironment` provider driver (flag `DELEGATE_CLOUD`): an instance whose threads run
 * their turns on a cloud session's server. Only delegate_task's `cloudSession` places a child on
 * it; each turn is authorized on this server (`t3team-remoteEnvironmentAuthorize.ts`), never by the
 * session the thread's own options name. Attachments are refused rather than dropped.
 *
 * The instance is the host's own, not the user's: its snapshot reports it disabled with no
 * models, so pickers and settings never offer it, while the dispatch gate admits it through
 * `hostProviderInstances` (`t3team-hostProviderInstances.ts`). It uses the server's shared
 * `CloudSessionAccess` and placement registry (`t3team-remoteEnvironmentServices.ts`) and the
 * HTTP client, read from the registry's context when the
 * instance is created; without them every turn fails with that reason.
 */
import { ProviderDriverKind } from "@t3tools/contracts";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderDriverCreateInput,
  type ProviderInstance,
} from "@t3tools/provider-core/server/driver";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { HttpClient } from "effect/http";

import { makeRemoteEnvironmentAuthorizer } from "./t3team-remoteEnvironmentAuthorize.ts";
import { RemoteEnvironmentPlacements } from "./t3team-remoteEnvironmentPlacements.ts";
import { RemoteEnvironmentRejected } from "./t3team-remoteEnvironmentPrepare.ts";
import { CloudSessionAccess } from "./t3team-remoteEnvironmentServices.ts";
import { openRemoteEnvironmentApi } from "./t3team-remoteEnvironmentApi.ts";
import {
  RemoteEnvironmentError,
  type RemoteEnvironmentSessionDeps,
} from "./t3team-remoteEnvironmentApiTypes.ts";
import { makeRemoteEnvironmentAdapter } from "./t3team-remoteEnvironmentAdapter.ts";
import {
  DISPLAY_NAME,
  makeSnapshot,
  unsupportedTextGeneration,
} from "./t3team-remoteEnvironmentSnapshot.ts";
import { REMOTE_ENVIRONMENT_DRIVER } from "./t3team-remoteEnvironmentTurn.ts";

const unplaceable = new RemoteEnvironmentRejected({
  reason: "placement",
  message:
    "This server has no Nexi broker connection for cloud sessions, so no child runs on one here.",
});

const unavailable = new RemoteEnvironmentError({
  message: "This server has no Nexi broker, so it cannot reach a cloud session.",
});

export const RemoteEnvironmentDriver: ProviderDriver<unknown> = {
  driverKind: ProviderDriverKind.make(REMOTE_ENVIRONMENT_DRIVER),
  metadata: {
    displayName: DISPLAY_NAME,
    supportsMultipleInstances: false,
    hasDefaultInstance: false,
  },
  configSchema: Schema.Unknown,
  defaultConfig: () => ({}),
  create: Effect.fn("RemoteEnvironmentDriver.create")(function* ({
    instanceId,
    displayName,
    accentColor,
    iconDataUrl,
    configurationSource,
    enabled,
  }: ProviderDriverCreateInput<unknown>) {
    const access = Option.getOrUndefined(yield* Effect.serviceOption(CloudSessionAccess));
    const placements = Option.getOrUndefined(
      yield* Effect.serviceOption(RemoteEnvironmentPlacements),
    );
    const http = Option.getOrUndefined(yield* Effect.serviceOption(HttpClient.HttpClient));
    const authorize =
      access === undefined || placements === undefined
        ? undefined
        : makeRemoteEnvironmentAuthorizer({
            placements,
            ownSessionIds: access.ownSessionIds,
          });
    const deps: RemoteEnvironmentSessionDeps = {
      open: (sessionId) =>
        access === undefined || http === undefined
          ? Effect.fail(unavailable)
          : access
              .connect(sessionId)
              .pipe(
                Effect.flatMap(openRemoteEnvironmentApi),
                Effect.provideService(HttpClient.HttpClient, http),
              ),
      authorize: (turn) => (authorize === undefined ? Effect.fail(unplaceable) : authorize(turn)),
    };
    const continuationIdentity = defaultProviderContinuationIdentity({
      driverKind: REMOTE_ENVIRONMENT_DRIVER,
      instanceId,
    });
    return {
      instanceId,
      driverKind: REMOTE_ENVIRONMENT_DRIVER,
      continuationIdentity,
      displayName,
      accentColor,
      iconDataUrl,
      configurationSource,
      enabled,
      snapshot: makeSnapshot(instanceId, continuationIdentity.continuationKey),
      orchestrationAdapter: makeRemoteEnvironmentAdapter(instanceId, deps),
      textGeneration: unsupportedTextGeneration,
    } satisfies ProviderInstance;
  }),
};
