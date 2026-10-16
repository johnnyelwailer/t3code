import { CLOUD_SESSION_LIFETIME_SECONDS } from "@t3tools/client-runtime/state/cloud-sessions";
import { CloudSessionFailedError } from "@t3tools/contracts";
import type { NexiBrokerClient } from "@t3tools/shared/t3team-nexiBrokerClient";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

/**
 * Starts a cloud session with nothing but the phone's Microsoft sign-in: the broker dispatches it,
 * so no desktop has to be running. Fails with a user-facing `CloudSessionFailedError`; a broker
 * that cannot start sessions on its own yet says so in its message.
 */
export const startBrokerCloudSession = (broker: Option.Option<NexiBrokerClient>) =>
  Option.match(broker, {
    onNone: () =>
      Effect.fail(
        new CloudSessionFailedError({
          reason: "broker_unavailable",
          message: "Cloud sessions are not set up in this build.",
        }),
      ),
    onSome: (client) => client.startSession({ durationSeconds: CLOUD_SESSION_LIFETIME_SECONDS }),
  });
