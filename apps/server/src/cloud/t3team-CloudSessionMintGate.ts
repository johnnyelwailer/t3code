import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as CliTokenManager from "./CliTokenManager.ts";
import {
  type CredentialGhExecutor,
  runCredentialHandoff,
} from "./t3team-CloudSessionCredential.ts";
import type { ConnectCredentialMintError } from "./t3team-ConnectCredentialMintError.ts";
import type { CloudSessionRepoRef } from "./t3team-githubActionsSessionClient.ts";

/** Friendly copy for the `connect_sign_in_pending` failure. */
export const CONNECT_SIGN_IN_PENDING_TEXT =
  "T3 Connect sign-in is finishing in your browser. Confirm it there, then try again.";

/**
 * The dispatch credential handoff with the in-app mint fallback.
 *
 * - flag off → the legacy shared-repo-secret path in `session.yml` takes over;
 *   nothing happens here.
 * - a usable credential exists → the handoff runs as before.
 * - no usable credential → attempt the in-app mint (the browser round-trip)
 *   with a bounded wait. create NEVER hangs: the wait is bounded, and the
 *   round-trip outlives this call, so the user's retry rides it. When the
 *   mint did not finish, the handoff fails with the bare
 *   `connect_sign_in_required` — which is rewritten to
 *   `connect_sign_in_pending`: a sign-in IS in flight, and the user's next
 *   step is to confirm it in the browser, not to start one.
 */
export const dispatchCredentialHandoff = Effect.fn(
  "cloud.session.dispatch_credential_handoff",
)(function* (input: {
  readonly repoRef: CloudSessionRepoRef;
  readonly sessionTag: string;
  readonly run: CredentialGhExecutor;
  readonly enabled: boolean;
  readonly readCredential: Effect.Effect<
    Option.Option<CliTokenManager.PersistedToken>,
    CliTokenManager.CloudCliTokenManagerError
  >;
  readonly mint: (input?: {
    readonly timeout?: Duration.Duration;
  }) => Effect.Effect<void, ConnectCredentialMintError>;
  readonly mintTimeout: Duration.Duration;
}) {
  // Flag off: no handoff at all — the legacy path takes over.
  if (!input.enabled) return;

  let mintAttempted = false;
  const existing = yield* input.readCredential.pipe(
    Effect.orElseSucceed((): Option.Option<CliTokenManager.PersistedToken> => Option.none()),
  );
  if (Option.isNone(existing)) {
    yield* input.mint({ timeout: input.mintTimeout }).pipe(
      Effect.tapError((error) =>
        Effect.logWarning("The in-app T3 Connect mint did not finish in time", {
          reason: error.reason,
        }),
      ),
      Effect.asVoid,
      // The mint failure is ABSORBED here on purpose: create answers with the
      // handoff's (rewritten) pending-sign-in error, not the mint's internals.
      // The round-trip keeps running in the background; a retry rides it.
      Effect.orElseSucceed((): undefined => undefined),
    );
    mintAttempted = true;
  }

  yield* runCredentialHandoff({
    repoRef: input.repoRef,
    sessionTag: input.sessionTag,
    run: input.run,
    enabled: true,
    readCredential: input.readCredential,
  }).pipe(
    Effect.catchIf(
      (error) =>
        mintAttempted &&
        error._tag === "CloudSessionFailedError" &&
        error.reason === "connect_sign_in_required",
      () =>
        Effect.fail(
          new CloudSessionFailedError({
            reason: "connect_sign_in_pending",
            message: CONNECT_SIGN_IN_PENDING_TEXT,
          }),
        ),
    ),
  );
});
