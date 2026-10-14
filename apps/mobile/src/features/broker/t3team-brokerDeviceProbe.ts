import type { ConnectionAttemptError } from "@t3tools/client-runtime/connection";
import { ConnectionTransientError } from "@t3tools/client-runtime/connection";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Schema from "effect/Schema";

import { brokerDeviceAddress } from "../../lib/t3team-brokerProxy";
import { deviceSignInRejected, deviceUnreachableFromPhone } from "./t3team-brokerConnectionErrors";

const Descriptor = Schema.Struct({ environmentId: Schema.String, label: Schema.String });
export type BrokerDeviceDescriptor = typeof Descriptor.Type;

const unreachable = (detail: string) =>
  new ConnectionTransientError({ reason: "remote-unavailable", detail });

/**
 * Asks a device's own server, through the broker proxy, which environment it is — the server's
 * public descriptor, so no server bearer is needed. One call proves the proxy reaches the device
 * and tells an enrolled machine's environment id, which the broker does not list.
 */
export const probeBrokerDevice = (
  key: string,
): Effect.Effect<BrokerDeviceDescriptor, ConnectionAttemptError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;
    const url = `${brokerDeviceAddress(key).httpBaseUrl}/.well-known/t3/environment`;
    const response = yield* http
      .execute(HttpClientRequest.get(url))
      .pipe(Effect.mapError(() => unreachable("The Nexi broker could not be reached.")));
    if (response.status === 404) return yield* deviceUnreachableFromPhone;
    if (response.status === 401) return yield* deviceSignInRejected;
    if (response.status >= 400) {
      return yield* unreachable(
        `The machine did not answer through the broker (HTTP ${response.status}).`,
      );
    }
    return yield* HttpClientResponse.schemaBodyJson(Descriptor)(response).pipe(
      Effect.mapError(() => unreachable("The machine answered the broker unexpectedly.")),
    );
  });
