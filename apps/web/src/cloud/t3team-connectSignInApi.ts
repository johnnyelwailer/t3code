import type { EnvironmentConnectSignInStatus } from "@t3tools/contracts";
import { makeEnvironmentHttpApiClient } from "@t3tools/client-runtime/rpc";
import * as Effect from "effect/Effect";
import { HttpClient } from "effect/http";

import * as PrimaryEnvironmentHttpLayer from "../environments/primary/httpLayer";
import { CloudEnvironmentLinkError, type CloudLinkTarget } from "./linkEnvironment";

/**
 * Reads whether this linked environment still needs the user's T3 Connect sign-in. Pure
 * read: the server never opens a browser in answer to this.
 */
export function readPrimaryConnectSignInStatus(input: {
  readonly target: CloudLinkTarget;
}): Effect.Effect<
  EnvironmentConnectSignInStatus,
  CloudEnvironmentLinkError,
  HttpClient.HttpClient
> {
  return Effect.gen(function* () {
    const client = yield* makeEnvironmentHttpApiClient(input.target.httpBaseUrl);
    return yield* client.connect.signInStatus({ headers: {} });
  }).pipe(
    Effect.mapError(
      (cause) =>
        new CloudEnvironmentLinkError({ message: "Could not read T3 Connect sign-in.", cause }),
    ),
    Effect.provide(PrimaryEnvironmentHttpLayer.layer),
  );
}

/**
 * Starts the browser sign-in the user just asked for. Returns as soon as the server has
 * opened the hosted page; poll the status to see it finish.
 */
export function startPrimaryConnectSignIn(input: {
  readonly target: CloudLinkTarget;
}): Effect.Effect<
  EnvironmentConnectSignInStatus,
  CloudEnvironmentLinkError,
  HttpClient.HttpClient
> {
  return Effect.gen(function* () {
    const client = yield* makeEnvironmentHttpApiClient(input.target.httpBaseUrl);
    return yield* client.connect.signIn({ headers: {} });
  }).pipe(
    Effect.mapError(
      (cause) =>
        new CloudEnvironmentLinkError({
          message: "Could not start the T3 Connect sign-in.",
          cause,
        }),
    ),
    Effect.provide(PrimaryEnvironmentHttpLayer.layer),
  );
}
