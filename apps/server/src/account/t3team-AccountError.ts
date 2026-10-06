import * as Schema from "effect/Schema";

/**
 * Why an account could not produce what a feature asked for. `sign_in_required`: the user must sign
 * in (again); `unavailable`: the issuer or the account is unreachable or unknown — try later. The
 * message is user-facing copy; a feature may wrap it in its own error.
 */
export class AccountError extends Schema.TaggedError<AccountError>()("AccountError", {
  reason: Schema.Literals(["sign_in_required", "unavailable"]),
  message: Schema.String,
}) {}
