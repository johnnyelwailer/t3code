import type { EnvironmentConnectSignInStatus } from "@t3tools/contracts";
import { EnvironmentRegistry } from "@t3tools/client-runtime/connection";
import { executeConnectedEnvironmentHttpRequest } from "@t3tools/client-runtime/state/environmentHttpAuth";
import * as Effect from "effect/Effect";
import type { HttpClient } from "effect/http";

import { CloudEnvironmentLinkError, type CloudLinkTarget } from "./linkEnvironment";

const CONNECT_SIGN_IN_REQUEST_TIMEOUT_MS = 30_000;

const signInRequest = (
  target: CloudLinkTarget,
  call:
    | { readonly method: "GET"; readonly operation: "signInStatus" }
    | { readonly method: "POST"; readonly operation: "signIn" },
  message: string,
): Effect.Effect<
  EnvironmentConnectSignInStatus,
  CloudEnvironmentLinkError,
  EnvironmentRegistry.EnvironmentRegistry | HttpClient.HttpClient
> =>
  Effect.flatMap(EnvironmentRegistry.EnvironmentRegistry, (registry) =>
    registry.run(
      target.environmentId,
      executeConnectedEnvironmentHttpRequest({
        group: "connect",
        method: call.method,
        timeoutMs: CONNECT_SIGN_IN_REQUEST_TIMEOUT_MS,
        url: (urls) => urls[call.operation](),
        request: ({ client, headers }) => client[call.operation]({ headers }),
      }),
    ),
  ).pipe(Effect.mapError((cause) => new CloudEnvironmentLinkError({ message, cause })));

/**
 * Reads whether this linked environment still needs the user's T3 Connect sign-in. Pure
 * read: the server never opens a browser in answer to this.
 */
export function readPrimaryConnectSignInStatus(input: { readonly target: CloudLinkTarget }) {
  return signInRequest(
    input.target,
    { method: "GET", operation: "signInStatus" },
    "Could not read T3 Connect sign-in.",
  );
}

/**
 * Starts the browser sign-in the user just asked for. Returns as soon as the server has
 * opened the hosted page; poll the status to see it finish.
 */
export function startPrimaryConnectSignIn(input: { readonly target: CloudLinkTarget }) {
  return signInRequest(
    input.target,
    { method: "POST", operation: "signIn" },
    "Could not start the T3 Connect sign-in.",
  );
}
