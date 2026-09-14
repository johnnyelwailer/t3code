import * as Schema from "effect/Schema";

/**
 * A *cloud session* is a full Nexi workspace provisioned on remote compute,
 * which joins the user's environment list once its relay link is up.
 *
 * The vocabulary here describes what the user asked for and what is happening
 * to it — never the provider's own nouns. A client must not have to learn what
 * a "workflow run" is in order to start a machine.
 */

/**
 * Where a cloud session's compute comes from. Genuinely vendor-specific: the
 * provisioning mechanics differ per provider, so these read as provider ids,
 * in the same shape as `RelayManagedEndpointProviderKind` in `relay.ts`.
 */
export const CloudSessionProviderKindSchema = Schema.Literals([
  "github_actions",
  "azure_container_apps",
]);
export type CloudSessionProviderKind = typeof CloudSessionProviderKindSchema.Type;

/**
 * Lifecycle of one provisioning attempt.
 *
 * `ready` is the only phase that can carry an `environmentId`: it is the only
 * phase in which the relay has published an environment link, and before that
 * there is nothing for a client to connect to.
 */
export const CloudSessionPhaseSchema = Schema.Literals([
  "requested",
  "queued",
  "preparing",
  "starting",
  "ready",
  "failed",
  "stopped",
]);
export type CloudSessionPhase = typeof CloudSessionPhaseSchema.Type;

export const CloudSessionSchema = Schema.Struct({
  /** Stable per attempt. Opaque to the client — do not parse it. */
  sessionId: Schema.String,
  providerKind: CloudSessionProviderKindSchema,
  phase: CloudSessionPhaseSchema,
  /** Seconds since the session was dispatched. Never negative. */
  elapsedSeconds: Schema.Int,
  /** Remaining lifetime in seconds; null until the session is running. */
  remainingSeconds: Schema.NullOr(Schema.Int),
  /** Human-readable compute shape, e.g. "ubuntu-slim · 12 GB · 4 cores". */
  machineLabel: Schema.String,
  /** Provider-supplied reason, present only when `phase` is `failed`. */
  failureReason: Schema.NullOr(Schema.String),
  /**
   * Where a human can watch the provisioning job. Present so a failed session
   * is diagnosable without leaving the app; null when the provider offers no
   * such page.
   */
  detailsUrl: Schema.NullOr(Schema.String),
});
export type CloudSession = typeof CloudSessionSchema.Type;

export const CloudSessionListResultSchema = Schema.Struct({
  sessions: Schema.Array(CloudSessionSchema),
  /**
   * False when the server has no provider configured yet, so the client can
   * offer setup instead of rendering a permanently empty list.
   */
  configured: Schema.Boolean,
});
export type CloudSessionListResult = typeof CloudSessionListResultSchema.Type;

export const CloudSessionCreateInputSchema = Schema.Struct({
  /** How long to hold the machine before it stops itself. */
  durationSeconds: Schema.Int,
});
export type CloudSessionCreateInput = typeof CloudSessionCreateInputSchema.Type;

export const CloudSessionCancelInputSchema = Schema.Struct({
  sessionId: Schema.String,
});
export type CloudSessionCancelInput = typeof CloudSessionCancelInputSchema.Type;

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
]);
export type CloudSessionFailureReason = typeof CloudSessionFailureReasonSchema.Type;

export class CloudSessionFailedError extends Schema.TaggedErrorClass<CloudSessionFailedError>()(
  "CloudSessionFailedError",
  {
    reason: CloudSessionFailureReasonSchema,
    /** Safe to show a user. Never contains the provider credential. */
    message: Schema.String,
  },
) {}
