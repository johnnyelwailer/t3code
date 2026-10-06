import * as Schema from "effect/Schema";

/**
 * The Nexi broker: how `nexi_broker` cloud sessions are reached (issue #556 in the distribution).
 * The fleet VM dials out to the broker; this server authenticates to it with the user's account
 * sign-in (`t3team-account`) and runs a loopback forwarder per attached session, so the client
 * connects to the VM exactly like any other bearer-authenticated environment.
 */

export const CloudBrokerStatusSchema = Schema.Struct({
  /** False when this build or server has no broker configured; then sessions use T3 Connect. */
  enabled: Schema.Boolean,
  /**
   * The account (`t3team-account`) whose sign-in the broker authenticates with, so a client can show
   * that account's sign-in where cloud sessions need it. Null when the broker is off.
   */
  accountId: Schema.NullOr(Schema.String),
});
export type CloudBrokerStatus = typeof CloudBrokerStatusSchema.Type;

export const CloudSessionAttachInputSchema = Schema.Struct({
  sessionId: Schema.String,
});
export type CloudSessionAttachInput = typeof CloudSessionAttachInputSchema.Type;

/** A ready broker session, made reachable on this machine through a loopback forwarder. */
export const CloudSessionAttachResultSchema = Schema.Struct({
  environmentId: Schema.String,
  label: Schema.String,
  httpBaseUrl: Schema.String,
  wsBaseUrl: Schema.String,
});
export type CloudSessionAttachResult = typeof CloudSessionAttachResultSchema.Type;

/**
 * A fresh one-time pairing credential minted by the session's own server. The client exchanges it
 * for a bearer session once and reuses that bearer on every reconnect, so pairing (a database write
 * on the VM) is the exception, not the per-connect cost.
 */
export const CloudSessionPairingResultSchema = Schema.Struct({
  pairingCredential: Schema.String,
});
export type CloudSessionPairingResult = typeof CloudSessionPairingResultSchema.Type;
