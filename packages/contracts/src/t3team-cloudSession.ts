import * as Schema from "effect/Schema";

import { ProjectId } from "./baseSchemas.ts";

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
/**
 * How a client reaches the session's machine. `t3_connect` sessions join through relay discovery
 * (Clerk + Cloudflare tunnel); `nexi_broker` sessions through the Nexi broker (Entra + the VM
 * dialing out), see `t3team-cloudBroker.ts`. Absent on records from servers that predate it.
 */
export const CloudSessionTransportSchema = Schema.Literals(["t3_connect", "nexi_broker"]);
export type CloudSessionTransport = typeof CloudSessionTransportSchema.Type;

export const CloudSessionPhaseSchema = Schema.Literals([
  "requested",
  "queued",
  "preparing",
  "starting",
  "ready",
  "failed",
  "stopped",
  "cancelled",
]);
export type CloudSessionPhase = typeof CloudSessionPhaseSchema.Type;

/**
 * Where a project-machine session is while it prepares: its devcontainer being built, its health
 * check running, then the session server being installed into it. The slowest part of a machine
 * session, so the client names it instead of one long "preparing".
 */
export const CloudSessionMachineStageSchema = Schema.Literals([
  "building",
  "checking",
  "installing",
]);
export type CloudSessionMachineStage = typeof CloudSessionMachineStageSchema.Type;

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
  /**
   * The relay environment this session's machine is registered under, so a
   * client can connect to it without re-discovering the relay. Optional: it
   * is minted on the machine the session runs on and only rides back when the
   * provider exposes it, so records from earlier sessions (and providers that
   * do not report it) still parse.
   */
  environmentId: Schema.optional(Schema.String),
  /**
   * How long the session actually ran, in seconds, present for terminal
   * sessions. Distinct from `elapsedSeconds`, which is the session's *age*
   * (now − dispatch) and keeps growing after the run ends.
   */
  durationSeconds: Schema.optional(Schema.Int),
  /** How a client connects to this session; absent means `t3_connect`. */
  transport: Schema.optional(CloudSessionTransportSchema),
  /** True when the session runs inside a project machine (its devcontainer); absent means not. */
  projectMachine: Schema.optional(Schema.Boolean),
  /** A project-machine session's milestone, present only while `phase` is `preparing`. */
  machineStage: Schema.optional(CloudSessionMachineStageSchema),
});
export type CloudSession = typeof CloudSessionSchema.Type;

export const CloudSessionListResultSchema = Schema.Struct({
  sessions: Schema.Array(CloudSessionSchema),
  /**
   * False when the server has no provider configured yet, so the client can
   * offer setup instead of rendering a permanently empty list.
   */
  configured: Schema.Boolean,
  /**
   * Where a human can browse every one of their sessions on the provider — the
   * escape hatch for the capped history the client shows. Optional: providers
   * without such a page, and older servers, omit it.
   */
  historyUrl: Schema.optional(Schema.String),
});
export type CloudSessionListResult = typeof CloudSessionListResultSchema.Type;

export const CloudSessionCreateInputSchema = Schema.Struct({
  /** How long to hold the machine before it stops itself. */
  durationSeconds: Schema.Int,
  /**
   * The project the session is for. When the project's checkouts hold a machine definition
   * (`t3team-projectMachine.ts`), the session runs inside that machine; otherwise it is a plain
   * session, exactly as without a project.
   */
  projectId: Schema.optional(ProjectId),
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
  /**
   * No usable T3 Connect credential exists on the creator's machine, so a
   * per-session credential cannot be handed to the VM. The remediation is to
   * sign in to T3 Connect on this machine; the client should surface a link,
   * not a generic retry.
   */
  "connect_sign_in_required",
  /**
   * The app started an in-app T3 Connect sign-in (a browser round-trip on the
   * creator's machine) but it had not finished when the bounded wait ended.
   * The user's browser still has the sign-in open: confirming it there makes
   * the retry succeed. Unlike `connect_sign_in_required`, the remediation is
   * to finish the sign-in that is already in flight, not to start one.
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
   * remediation is the in-app Nexplore sign-in (a device code), not a retry.
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
]);
export type CloudSessionFailureReason = typeof CloudSessionFailureReasonSchema.Type;

export class CloudSessionFailedError extends Schema.TaggedError<CloudSessionFailedError>()(
  "CloudSessionFailedError",
  {
    reason: CloudSessionFailureReasonSchema,
    /** Safe to show a user. Never contains the provider credential. */
    message: Schema.String,
  },
) {}
