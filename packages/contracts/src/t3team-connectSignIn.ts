import * as Schema from "effect/Schema";

/**
 * Where this install's user-started T3 Connect browser sign-in stands.
 *
 * - `idle`: no sign-in has been started since the server started (or the last one succeeded).
 * - `in_progress`: the user started a sign-in; the hosted page is open in their browser.
 * - `failed`: the user's last sign-in did not finish (closed, timed out, refused). The server
 *   never retries on its own; the user can start another one from the notice.
 */
export const EnvironmentConnectSignInAttempt = Schema.Literals(["idle", "in_progress", "failed"]);
export type EnvironmentConnectSignInAttempt = typeof EnvironmentConnectSignInAttempt.Type;

/**
 * Whether this environment is linked to T3 Connect but lacks the per-user credential that
 * cloud sessions need. The server only reports this; a browser opens solely when the user
 * asks for it (`POST /api/connect/sign-in`).
 */
export const EnvironmentConnectSignInStatus = Schema.Struct({
  required: Schema.Boolean,
  attempt: EnvironmentConnectSignInAttempt,
});
export type EnvironmentConnectSignInStatus = typeof EnvironmentConnectSignInStatus.Type;
