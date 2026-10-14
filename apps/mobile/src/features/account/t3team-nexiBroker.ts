import type { AccountError } from "@t3tools/contracts";
import {
  BROKER_RESOURCE,
  brokerAccessToken,
  makeNexiBrokerClient,
  type NexiBrokerClient,
} from "@t3tools/shared/t3team-nexiBrokerClient";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

/**
 * The Nexi broker (cloud sessions), authenticated by the app's Microsoft account: every call
 * carries the account's `broker` token, refreshed from the stored grant. Signed out, or with a
 * grant Entra no longer accepts, calls fail with `broker_sign_in_required` — the UI's cue to
 * offer "Sign in with Microsoft". The T3 relay keeps its own sign-in; this is the broker's.
 */
export const makeMobileNexiBroker = (input: {
  readonly url: string | null;
  readonly accessToken: (resource: string) => Effect.Effect<string, AccountError>;
}) =>
  input.url === null
    ? Effect.succeed(Option.none<NexiBrokerClient>())
    : makeNexiBrokerClient(
        { url: input.url.replace(/\/+$/, "") },
        brokerAccessToken(input.accessToken(BROKER_RESOURCE)),
      ).pipe(Effect.map(Option.some));
