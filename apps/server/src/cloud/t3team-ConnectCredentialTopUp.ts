import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as CliTokenManager from "./CliTokenManager.ts";
import { CLOUD_LINKED_USER_ID } from "./config.ts";

/**
 * The background keep-alive for this install's per-user T3 Connect credential.
 *
 * - linked, credential present → `getExisting`'s refresh-5-minutes-early renews it quietly;
 * - linked, credential missing or unrefreshable → NOTHING happens here. The UI reads that
 *   state from `ConnectSignInPrompt` and offers a dismissible "Sign in to T3 Connect"
 *   notice; the browser opens only when the user clicks it. This job must never open a
 *   browser — an earlier version did, every few minutes, without being asked;
 * - not linked → nothing is read beyond the link secret.
 *
 * It runs as a parked server fiber (see server.ts): a first pass shortly after activation,
 * then on a quiet interval. Each pass costs at most two local secret reads plus, only near
 * expiry, one token refresh request.
 */

const CONNECT_CREDENTIAL_KEEP_ALIVE_INITIAL_DELAY = Duration.seconds(20);
const CONNECT_CREDENTIAL_KEEP_ALIVE_INTERVAL = Duration.minutes(5);

/** Result of one pass, so callers and tests can see what it decided. */
export type ConnectCredentialKeepAliveOutcome = "not_linked" | "fresh" | "sign_in_required";

/** One pass. Never opens a browser and never starts a sign-in. */
export const topUpConnectCredentialOnce = Effect.fn("cloud.connect.top_up_once")(function* () {
  const secrets = yield* ServerSecretStore.ServerSecretStore;
  const cloudCli = yield* CliTokenManager.CloudCliTokenManager;

  const linked = yield* secrets.get(CLOUD_LINKED_USER_ID);
  const notLinked: ConnectCredentialKeepAliveOutcome = "not_linked";
  if (Option.isNone(linked)) return notLinked;

  const existing = yield* cloudCli.getExisting.pipe(
    Effect.orElseSucceed((): Option.Option<CliTokenManager.PersistedToken> => Option.none()),
  );
  const outcome: ConnectCredentialKeepAliveOutcome = Option.isSome(existing)
    ? "fresh"
    : "sign_in_required";
  return outcome;
});

/**
 * The long-running keep-alive: initial delay, then one pass per interval. Every pass is
 * error-absorbing, so one bad cycle never stops the loop; it ends with the server scope.
 */
export const runConnectCredentialTopUp = Effect.fn("cloud.connect.top_up")(function* () {
  yield* Effect.sleep(CONNECT_CREDENTIAL_KEEP_ALIVE_INITIAL_DELAY);
  yield* topUpConnectCredentialOnce().pipe(
    Effect.catchCause((cause) =>
      Effect.logDebug("T3 Connect credential keep-alive pass failed", { cause }),
    ),
    Effect.repeat(Schedule.spaced(CONNECT_CREDENTIAL_KEEP_ALIVE_INTERVAL)),
  );
});
