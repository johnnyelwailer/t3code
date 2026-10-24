/**
 * The `remoteEnvironment` provider driver (flag `DELEGATE_CLOUD`): an instance whose threads run
 * their turns on a cloud session's server. Only delegate_task's `cloudSession` places a child on
 * it; each turn is authorized on this server (`t3team-remoteEnvironmentAuthorize.ts`), never by the
 * session the thread's own options name. Attachments are refused rather than dropped.
 *
 * The instance is the host's own, not the user's: its snapshot reports it disabled with no
 * models, so pickers and settings never offer it, while the dispatch gate admits it through
 * `hostProviderInstances` (`t3team-hostProviderInstances.ts`). It uses the server's shared
 * `CloudSessionAccess` and placement registry (`t3team-remoteEnvironmentServices.ts`), the
 * repository identity resolver and the HTTP client, read from the registry's context when the
 * instance is created; without them every turn fails with that reason.
 */
import { ProviderDriverKind, repositoryGroupingKeyOf } from "@t3tools/contracts";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderDriverCreateInput,
  type ProviderInstance,
} from "@t3tools/provider-core/server/driver";
import type { ProviderAdapterV2OpenSessionInput } from "@t3tools/provider-core/server/ProviderAdapter";
import { turnScopedSelectionTransition } from "@t3tools/provider-core/server/selectionTransition";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { HttpClient } from "effect/http";

import { RepositoryIdentityResolver } from "./project/RepositoryIdentityResolver.ts";
import { makeRemoteEnvironmentAuthorizer } from "./t3team-remoteEnvironmentAuthorize.ts";
import { RemoteEnvironmentPlacements } from "./t3team-remoteEnvironmentPlacements.ts";
import { RemoteEnvironmentRejected } from "./t3team-remoteEnvironmentPrepare.ts";
import { CloudSessionAccess } from "./t3team-remoteEnvironmentServices.ts";
import { openRemoteEnvironmentApi } from "./t3team-remoteEnvironmentApi.ts";
import {
  RemoteEnvironmentError,
  type RemoteEnvironmentSessionDeps,
} from "./t3team-remoteEnvironmentApiTypes.ts";
import {
  REMOTE_ENVIRONMENT_CAPABILITIES,
  remoteEnvironmentProviderSession,
} from "./t3team-remoteEnvironmentCapabilities.ts";
import { makeRemoteEnvironmentSession } from "./t3team-remoteEnvironmentSession.ts";
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
    const identities = Option.getOrUndefined(
      yield* Effect.serviceOption(RepositoryIdentityResolver),
    );
    const http = Option.getOrUndefined(yield* Effect.serviceOption(HttpClient.HttpClient));
    const authorize =
      access === undefined || placements === undefined || identities === undefined
        ? undefined
        : makeRemoteEnvironmentAuthorizer({
            placements,
            ownSessionIds: access.ownSessionIds,
            repositoryKeyOf: (cwd) =>
              Effect.map(identities.resolve(cwd), (identity) =>
                identity === null ? null : repositoryGroupingKeyOf(identity),
              ),
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
      orchestrationAdapter: {
        instanceId,
        driver: REMOTE_ENVIRONMENT_DRIVER,
        getCapabilities: () => Effect.succeed(REMOTE_ENVIRONMENT_CAPABILITIES),
        planSelectionTransition: () => Effect.succeed(turnScopedSelectionTransition()),
        openSession: Effect.fn("RemoteEnvironmentDriver.openSession")(function* (
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
      },
      textGeneration: unsupportedTextGeneration,
    } satisfies ProviderInstance;
  }),
};
