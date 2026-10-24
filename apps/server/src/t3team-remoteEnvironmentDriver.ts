/**
 * The `remoteEnvironment` provider driver (flag `DELEGATE_CLOUD`): an instance whose threads run
 * their turns on a cloud session's server. Only delegate_task's `cloudSession` routes a child to
 * it; the target travels in the child's model selection (`t3team-remoteEnvironmentTarget.ts`).
 *
 * The instance is the host's own, not the user's: its snapshot reports it disabled with no
 * models, so pickers and settings never offer it, while the dispatch gate admits it through
 * `hostProviderInstances` (`t3team-hostProviderInstances.ts`). It reaches sessions through the
 * server's broker (`NexiBrokerService`) and HTTP client, read from the registry's context when
 * the instance is created; without them every turn fails with that reason.
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

import { makeCloudSessionConnector } from "./cloud/t3team-cloudSessionConnector.ts";
import { NexiBrokerService } from "./cloud/t3team-NexiBrokerService.ts";
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
    const broker = yield* Effect.serviceOption(NexiBrokerService);
    const http = yield* Effect.serviceOption(HttpClient.HttpClient);
    const connector =
      Option.isSome(broker) && broker.value.enabled && Option.isSome(http)
        ? yield* makeCloudSessionConnector(broker.value).pipe(
            Effect.provideService(HttpClient.HttpClient, http.value),
          )
        : undefined;
    const deps: RemoteEnvironmentSessionDeps = {
      open: (sessionId) =>
        connector === undefined || Option.isNone(http)
          ? Effect.fail(unavailable)
          : connector
              .connect(sessionId)
              .pipe(
                Effect.flatMap(openRemoteEnvironmentApi),
                Effect.provideService(HttpClient.HttpClient, http.value),
              ),
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
