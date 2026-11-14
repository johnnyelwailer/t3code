import * as Schema from "effect/Schema";

/** Why a cloud-session request failed, and the error that carries it (`t3team-cloudSession.ts`). */
export const CloudSessionFailureReasonSchema = Schema.Literals([
  /** No provider is configured on this server yet. */
  "not_configured",
  /** The stored credential was rejected by the provider. */
  "unauthorized",
  /** The provider was reachable but refused the request. */
  "rejected",
  /** The provider could not be reached at all. */
  "unreachable",
  /** The session id does not correspond to a known session. */
  "unknown_session",
  /**
   * The session an attach asked for has ended: the broker has not listed it (nor a live session
   * serving the same environment) for longer than any reconnect or broker restart takes. Terminal,
   * unlike `unknown_session` (still starting, or the broker has lost sight of it for a moment): a
   * client stops retrying and offers a new session.
   */
  "session_ended",
  /**
   * No usable T3 Connect credential exists on the creator's machine, so a
   * per-session credential cannot be handed to the VM. The remediation is to
   * sign in to T3 Connect on this machine; the client should surface a link,
   * not a generic retry.
   */
  "connect_sign_in_required",
  /**
   * The in-app T3 Connect sign-in was still in flight when the bounded wait
   * ended. The user's browser has it open: finish the sign-in there and the
   * retry succeeds.
   */
  "connect_sign_in_pending",
  /**
   * The per-session credential payload could not be written to its delivery
   * issue (gh failure). The creator can retry — the credential itself is
   * intact, only its handoff to the VM failed.
   */
  "payload_issue_failed",
  /**
   * The Nexi broker is this server's transport and the user is not signed in to it (Entra). The
   * remediation is the in-app account sign-in, not a retry.
   */
  "broker_sign_in_required",
  /** The Nexi broker could not be reached or refused the request. */
  "broker_unavailable",
  /**
   * The project has a machine definition the session cannot use as it is: the pointer is broken,
   * or the definition has changes that are not committed and pushed. The message says which.
   */
  "machine_unavailable",
  /**
   * The project machine's repository host has no `gh` sign-in on this machine, so the session
   * cannot clone it as the user. The remediation is `gh auth login` for that host.
   */
  "repository_sign_in_required",
  /**
   * A delete was refused because the machine's unpushed work could not be saved first: the
   * session would not stop, or its push to the `wip/` branch failed. The message says which,
   * and that nothing was deleted.
   */
  "delete_blocked",
]);
export type CloudSessionFailureReason = typeof CloudSessionFailureReasonSchema.Type;

export class CloudSessionFailedError extends Schema.TaggedError<CloudSessionFailedError>()(
  "CloudSessionFailedError",
  {
    reason: CloudSessionFailureReasonSchema,
    /** Safe to show a user. Never contains the provider credential. */
    message: Schema.String,
    /**
     * When the provider paused this host (rate limit / quota reserve), the
     * earliest wall-clock ms a retry can succeed. Clients back off until then
     * instead of re-polling into the same pause.
     */
    retryAt: Schema.optionalKey(Schema.Number),
    /**
     * The provider host the failing request needs a sign-in for (`unauthorized`,
     * `repository_sign_in_required`). The client signs in to exactly this host, so the sign-in
     * cannot land on a different one than the request that failed.
     */
    host: Schema.optionalKey(Schema.String),
  },
) {}
