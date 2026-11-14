import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { EnvironmentRpcUnavailableError, isRpcClientError } from "./rpc/client.ts";

const isNotConnected = Schema.is(EnvironmentRpcUnavailableError);

/**
 * The connection was lost: it closed before the reply (the server may have run the command), or
 * there was none to send on. The same command id is then safe to send again. A client defect on
 * a live connection (a reply that would not decode) is not a loss: it fails like any error.
 */
export function isLostReply<E>(cause: Cause.Cause<E>): boolean {
  if (Cause.hasInterruptsOnly(cause)) return true;
  const error = Cause.findErrorOption(cause);
  if (Option.isNone(error)) return false;
  if (isNotConnected(error.value)) return true;
  return isRpcClientError(error.value) && error.value.reason._tag !== "RpcClientDefect";
}
