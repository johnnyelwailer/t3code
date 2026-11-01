/**
 * Adding a missing scope to the user's own `gh` sign-in from the credential card. `refreshStart` makes
 * the machine run `gh auth refresh` and returns the one-time device code and the page to approve it on
 * (a device code is not a secret); `refreshStatus` says whether the user has approved. Neither returns
 * a token: reading a value stays the separate, explicit `credentialSources.read`.
 */
import * as Schema from "effect/Schema";

import { CredentialHost, CredentialScope } from "./t3team-credentialSources.ts";

export const CredentialRefreshStartInput = Schema.Struct({
  host: CredentialHost,
  scopes: Schema.Array(CredentialScope).check(Schema.isMinLength(1), Schema.isMaxLength(16)),
});
export type CredentialRefreshStartInput = typeof CredentialRefreshStartInput.Type;

export const CredentialRefreshStartResult = Schema.Struct({
  /** Unguessable; the only handle to this flow. */
  id: Schema.String,
  userCode: Schema.String,
  verificationUri: Schema.String,
  expiresInSeconds: Schema.Number,
});
export type CredentialRefreshStartResult = typeof CredentialRefreshStartResult.Type;

export const CredentialRefreshStatusInput = Schema.Struct({ id: Schema.String });
export type CredentialRefreshStatusInput = typeof CredentialRefreshStatusInput.Type;

export const CredentialRefreshStatusResult = Schema.Struct({
  state: Schema.Literals(["pending", "done", "failed"]),
});
export type CredentialRefreshStatusResult = typeof CredentialRefreshStatusResult.Type;

export class CredentialRefreshError extends Schema.TaggedError<CredentialRefreshError>()(
  "CredentialRefreshError",
  { reason: Schema.Literals(["not_available", "start_failed", "unknown_id"]) },
) {
  override get message(): string {
    switch (this.reason) {
      case "not_available":
        return "That host has no gh sign-in this machine can refresh.";
      case "start_failed":
        return "gh did not start a sign-in.";
      case "unknown_id":
        return "That sign-in is not running any more.";
    }
  }
}
