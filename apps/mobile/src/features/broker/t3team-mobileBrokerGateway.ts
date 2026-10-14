import { BrokerEnvironmentGateway } from "@t3tools/client-runtime/connection";
import type { CloudSessionFailedError } from "@t3tools/contracts";
import { sessionToAttach } from "@t3tools/shared/t3team-nexiBrokerAttach";
import type { NexiBrokerClient } from "@t3tools/shared/t3team-nexiBrokerClient";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as Option from "effect/Option";

import {
  brokerConnectionError,
  deviceOffline,
  noBrokerConfigured,
  sessionMovedEnvironment,
  sessionNotRunning,
} from "./t3team-brokerConnectionErrors";
import { isBrokerHostKey } from "./t3team-brokerDevices";
import { probeBrokerDevice } from "./t3team-brokerDeviceProbe";
import { brokerDeviceAddress } from "./t3team-brokerProxy";

/**
 * The phone's side of `BrokerEnvironmentGateway`. The desktop makes a session reachable through a
 * loopback forwarder; a phone cannot listen on a port, so it goes through the broker's reverse
 * proxy (`t3team-brokerProxy.ts`). Attaching checks the device with the broker, then asks the
 * device itself through the proxy, so a broker without phone access fails here with a clear
 * reason instead of deep inside the bearer handshake.
 */
export const makeMobileBrokerGateway = (deps: {
  readonly broker: Effect.Effect<Option.Option<NexiBrokerClient>>;
  readonly http: HttpClient.HttpClient;
}) => {
  const client = deps.broker.pipe(
    Effect.flatMap((broker) =>
      Option.isSome(broker) ? Effect.succeed(broker.value) : Effect.fail(noBrokerConfigured),
    ),
  );
  const brokerCall = <A>(call: Effect.Effect<A, CloudSessionFailedError>) =>
    call.pipe(Effect.mapError(brokerConnectionError));

  /** The broker key to reach: an online machine, or the run serving the asked environment. */
  const resolveKey = (broker: NexiBrokerClient, sessionId: string, environmentId: string) =>
    Effect.gen(function* () {
      if (isBrokerHostKey(sessionId)) {
        const hosts = yield* brokerCall(broker.listHosts);
        const host = hosts.find((candidate) => `h-${candidate.id}` === sessionId);
        if (host === undefined || !host.online)
          return yield* deviceOffline(host?.label ?? "That machine");
        return sessionId;
      }
      const sessions = yield* brokerCall(broker.listSessions);
      const session = sessionToAttach(sessions, { sessionId, environmentId });
      if (session === undefined) return yield* sessionNotRunning;
      return session.runId;
    });

  return BrokerEnvironmentGateway.of({
    attach: (input) =>
      Effect.gen(function* () {
        const broker = yield* client;
        const environmentId = String(input.expectedEnvironmentId);
        const key = yield* resolveKey(broker, input.sessionId, environmentId);
        const descriptor = yield* probeBrokerDevice(key).pipe(
          Effect.provideService(HttpClient.HttpClient, deps.http),
        );
        if (descriptor.environmentId !== environmentId) return yield* sessionMovedEnvironment;
        return { sessionId: key, ...brokerDeviceAddress(key) };
      }),
    pair: (input) =>
      client.pipe(Effect.flatMap((broker) => brokerCall(broker.mintPairing(input.sessionId)))),
  });
};
