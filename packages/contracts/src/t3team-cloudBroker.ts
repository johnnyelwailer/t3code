import * as Schema from "effect/Schema";

/**
 * The Nexi broker: how `nexi_broker` cloud sessions are reached (issue #556 in the distribution).
 * The fleet VM dials out to the broker; this server signs the user in to it with Entra (the
 * browser, or a device code where none can open) and runs a loopback forwarder per attached session, so the client
 * connects to the VM exactly like any other bearer-authenticated environment.
 */

/** The user's Entra sign-in with the broker, as this server holds it. */
export const CloudBrokerAuthStateSchema = Schema.Union([
  Schema.TaggedStruct("SignedOut", {}),
  /** A sign-in is waiting: in the browser it opened, or by entering `userCode` at `verificationUri`. */
  Schema.TaggedStruct("SigningIn", {
    userCode: Schema.String,
    verificationUri: Schema.String,
    expiresAtMs: Schema.Number,
  }),
  Schema.TaggedStruct("SignedIn", {
    /** Display name from the token, when Entra sent one. */
    name: Schema.NullOr(Schema.String),
  }),
]);
export type CloudBrokerAuthState = typeof CloudBrokerAuthStateSchema.Type;

export const CloudBrokerStatusSchema = Schema.Struct({
  /** False when this build or server has no broker configured; then sessions use T3 Connect. */
  enabled: Schema.Boolean,
  auth: CloudBrokerAuthStateSchema,
  /** Why the last sign-in attempt ended without signing in (expired code, declined, …). */
  lastError: Schema.NullOr(Schema.String),
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
