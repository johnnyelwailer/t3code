import type { CloudSessionFailedError } from "@t3tools/contracts";
import type { NexiBrokerClient } from "@t3tools/shared/t3team-nexiBrokerClient";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { type BrokerDevice, brokerDevices } from "./t3team-brokerDevices";

/**
 * One read of the user's devices from the broker, in the states the Machines screen shows: a build
 * without a broker, a sign-in the broker needs (the cue to show the Microsoft account section), a
 * broker that could not answer, or the list.
 */
export type BrokerDeviceListState =
  | { readonly _tag: "Unavailable" }
  | { readonly _tag: "SignInRequired"; readonly message: string }
  | { readonly _tag: "Failed"; readonly message: string }
  | { readonly _tag: "Loaded"; readonly devices: ReadonlyArray<BrokerDevice> };

export const isBrokerSignInRequired = (error: CloudSessionFailedError) =>
  error.reason === "broker_sign_in_required";

export const brokerFailureState = (error: CloudSessionFailedError): BrokerDeviceListState =>
  isBrokerSignInRequired(error)
    ? { _tag: "SignInRequired", message: error.message }
    : { _tag: "Failed", message: error.message };

export const loadBrokerDeviceList = (
  broker: Option.Option<NexiBrokerClient>,
): Effect.Effect<BrokerDeviceListState> =>
  Option.match(broker, {
    onNone: () => Effect.succeed<BrokerDeviceListState>({ _tag: "Unavailable" }),
    onSome: (client) =>
      Effect.all([client.listHosts, client.listSessions], { concurrency: 2 }).pipe(
        Effect.map(([hosts, sessions]): BrokerDeviceListState => ({
          _tag: "Loaded",
          devices: brokerDevices(hosts, sessions),
        })),
        Effect.catch((error) => Effect.succeed(brokerFailureState(error))),
      ),
  });
