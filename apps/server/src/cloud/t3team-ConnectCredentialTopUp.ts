import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as CliTokenManager from "./CliTokenManager.ts";
import { CLOUD_LINKED_USER_ID } from "./config.ts";
import * as ConnectCredentialMinter from "./t3team-ConnectCredentialMinter.ts";

/**
 * The background top-up for this install's per-user T3 Connect credential.
 *
 * The link itself is installed by the app (or a phone) writing the
 * `cloud-linked-user-id` secret; the credential that the cloud-session
 * handoff needs is a DIFFERENT secret that only the CLI's terminal flow used
 * to produce. So "linked but no usable credential" is a live, expected state
 * right after a first in-app link — and this top-up is what closes it without
 * any manual step:
 *
 * - linked, credential missing or unrefreshable → start the in-app mint
 *   (the browser round-trip; non-blocking, failures only log);
 * - linked, credential present → `getExisting`'s refresh-5-minutes-early
 *   keeps it alive, so nothing happens;
 * - not linked → no mint is ever attempted.
 *
 * It runs as a parked server fiber (see the wiring in server.ts): a first
 * pass shortly after activation, then on a quiet interval forever. Each pass
 * costs at most two local secret reads plus, only while a credential is
 * missing, the mint attempt itself.
 */

/** Give the first pass a beat after activation before it may open a browser. */
export const CONNECT_CREDENTIAL_TOP_UP_INITIAL_DELAY = Duration.seconds(20);

/** Quiet cadence; the mint itself bounds any single attempt. */
export const CONNECT_CREDENTIAL_TOP_UP_INTERVAL = Duration.minutes(5);

/**
 * One top-up pass. Idempotent and side-effect-free unless the linked
 * environment actually lacks a usable credential.
 */
export const topUpConnectCredentialOnce = Effect.fn("cloud.connect.top_up_once")(function* () {
  const secrets = yield* ServerSecretStore.ServerSecretStore;
  const cloudCli = yield* CliTokenManager.CloudCliTokenManager;
  const minter = yield* ConnectCredentialMinter.ConnectCredentialMinter;

  // Not linked → the credential belongs to no one here; never attempt a mint.
  const linked = yield* secrets.get(CLOUD_LINKED_USER_ID);
  if (Option.isNone(linked)) return;

  // A usable credential (auto-refreshed near expiry) → nothing to do.
  const existing = yield* cloudCli.getExisting.pipe(
    Effect.orElseSucceed((): Option.Option<CliTokenManager.PersistedToken> => Option.none()),
  );
  if (Option.isSome(existing)) return;

  yield* minter.mint().pipe(
    Effect.tap(() =>
      Effect.logInfo("Topped up the in-app T3 Connect credential after the browser sign-in"),
    ),
    Effect.tapError((error) =>
      Effect.logWarning("The T3 Connect credential top-up could not finish", {
        reason: error.reason,
      }),
    ),
    Effect.asVoid,
    // A failed cycle (timeout, refused exchange, …) must not stop the loop:
    // the next interval simply tries again.
    Effect.orElseSucceed((): undefined => undefined),
  );
});

/**
 * The long-running top-up: initial delay, then one pass per interval.
 * Every pass is error-absorbing (the mint's failures only log), so one bad
 * cycle can never stop the loop; the loop itself only ends with the server
 * scope. A single pass is bounded by the mint's own bounded wait.
 */
export const runConnectCredentialTopUp = Effect.fn("cloud.connect.top_up")(function* () {
  yield* Effect.sleep(CONNECT_CREDENTIAL_TOP_UP_INITIAL_DELAY);
  yield* topUpConnectCredentialOnce().pipe(
    Effect.repeat(Schedule.spaced(CONNECT_CREDENTIAL_TOP_UP_INTERVAL)),
  );
});
