import * as Schema from "effect/Schema";

/**
 * An account the server signs the user in to, as a pack defined it (`defineAccount` in
 * `@t3team/pack-api`): its sign-in state as this server holds it. Features that need the user's
 * identity (cloud sessions, a pack's own services) ask the server for a token instead of each
 * running a sign-in of their own.
 */

export const AccountAuthStateSchema = Schema.Union([
  Schema.TaggedStruct("SignedOut", {}),
  /**
   * A sign-in is waiting: in the browser it opened, or by entering `userCode` at `verificationUri`.
   * Both are null when the issuer has no device-code grant (the browser is the only way in).
   */
  Schema.TaggedStruct("SigningIn", {
    userCode: Schema.NullOr(Schema.String),
    verificationUri: Schema.NullOr(Schema.String),
    expiresAtMs: Schema.Number,
  }),
  Schema.TaggedStruct("SignedIn", {
    /** Display name from the token, when the issuer sent one. */
    name: Schema.NullOr(Schema.String),
  }),
]);
export type AccountAuthState = typeof AccountAuthStateSchema.Type;

export const AccountStatusSchema = Schema.Struct({
  id: Schema.String,
  /** What the user signs in to, e.g. "Sign in to {label}". */
  label: Schema.String,
  auth: AccountAuthStateSchema,
  /** Why the last sign-in attempt ended without signing in (expired code, declined, …). */
  lastError: Schema.NullOr(Schema.String),
});
export type AccountStatus = typeof AccountStatusSchema.Type;

export const AccountListResultSchema = Schema.Struct({
  accounts: Schema.Array(AccountStatusSchema),
});
export type AccountListResult = typeof AccountListResultSchema.Type;
