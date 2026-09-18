import * as Schema from "effect/Schema";

/**
 * The structured failure of an in-app T3 Connect credential mint.
 *
 * The `reason` is the machine-usable part (the top-up logs it, the
 * cloud-session service branches on it); the derived `message` is the
 * friendly, user-safe copy — never a raw provider error or stack.
 */
export const ConnectCredentialMintFailureReason = Schema.Literals([
  /** This server has no T3 Connect OAuth configuration, so a mint is impossible. */
  "connect_unavailable",
  /** No usable listener could be started (a sign-in is already in progress elsewhere). */
  "callback_listener_failed",
  /** The browser round-trip did not finish within the bounded wait. */
  "browser_callback_timeout",
  /** The connect service refused the authorization code exchange. */
  "token_exchange_failed",
  /** The minted credential could not be persisted. */
  "credential_store_failed",
]);
export type ConnectCredentialMintFailureReason =
  typeof ConnectCredentialMintFailureReason.Type;

export class ConnectCredentialMintError extends Schema.TaggedErrorClass<ConnectCredentialMintError>()(
  "ConnectCredentialMintError",
  {
    reason: ConnectCredentialMintFailureReason,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    switch (this.reason) {
      case "connect_unavailable":
        return "T3 Connect is not configured on this server, so a sign-in cannot be prepared.";
      case "callback_listener_failed":
        return "Another T3 Connect sign-in is already in progress on this machine. Try again in a moment.";
      case "browser_callback_timeout":
        return "The T3 Connect sign-in in your browser did not finish in time. Confirm it there, then try again.";
      case "token_exchange_failed":
        return "T3 Connect refused the sign-in. Sign in to your account in the browser, then try again.";
      case "credential_store_failed":
        return "Could not store the T3 Connect credential on this machine.";
    }
  }
}

export const isConnectCredentialMintError = Schema.is(ConnectCredentialMintError);
