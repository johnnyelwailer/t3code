/**
 * The server's ONE broker connector and ONE placement registry for cloud children, provided once
 * in server.ts so delegate_task (its probe and its placements) and the `remoteEnvironment` driver
 * (its turns) share them: one held bearer per session, one pairing at a time, one list of the
 * children placed here.
 */
import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  type CloudSessionConnector,
  makeCloudSessionConnector,
} from "./cloud/t3team-cloudSessionConnector.ts";
import { NexiBrokerService } from "./cloud/t3team-NexiBrokerService.ts";
import { remoteEnvironmentPlacementsLayer } from "./t3team-remoteEnvironmentPlacements.ts";

export interface CloudSessionAccessShape extends CloudSessionConnector {
  /** The run ids of the signed-in owner's own sessions, as the broker lists them. */
  readonly ownSessionIds: Effect.Effect<ReadonlyArray<string>, CloudSessionFailedError>;
}

export class CloudSessionAccess extends Context.Service<
  CloudSessionAccess,
  CloudSessionAccessShape
>()("t3/t3team-remoteEnvironmentServices/CloudSessionAccess") {}

const noBroker = new CloudSessionFailedError({
  reason: "broker_unavailable",
  message:
    "This build has no Nexi broker configured, and a server reaches a cloud session only through it.",
});

const makeCloudSessionAccess = Effect.gen(function* () {
  const broker = yield* NexiBrokerService;
  const connector = yield* makeCloudSessionConnector(broker);
  return {
    ...connector,
    ownSessionIds: broker.enabled
      ? Effect.map(broker.sessions, (sessions) => sessions.map((session) => session.runId))
      : Effect.fail(noBroker),
  } satisfies CloudSessionAccessShape;
});

export const cloudSessionAccessLayer = Layer.effect(CloudSessionAccess, makeCloudSessionAccess);

/** Needs the server's `NexiBrokerService` and `HttpClient`. */
export const T3TeamRemoteEnvironmentLive = Layer.mergeAll(
  cloudSessionAccessLayer,
  remoteEnvironmentPlacementsLayer,
);
