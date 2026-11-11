/**
 * Why a tool-auth flow ended in `failed`/`expired`, as a closed set. `ToolAuthState.message` stays
 * the CLI's own verbatim text; this is the machine-readable half, so a client maps it to its own
 * plain words instead of pattern-matching prose or showing a raw error string.
 * @module contracts/toolAuthReason
 */
import * as Schema from "effect/Schema";

export const ToolAuthFailureReason = Schema.Literals([
  /** The host's `INTEGRATIONS_TOOL_AUTH` switch is off, so nothing was spawned. */
  "featureDisabled",
  /** The CLI binary is not on PATH and no install was attempted. */
  "notInstalled",
  /** The package manager ran and the binary still is not there. */
  "installFailed",
  /** The install was killed after `ToolAuthService`'s install timeout. */
  "installTimedOut",
  /** The CLI itself reported a failed sign-in (declined, wrong code, expired device code). */
  "signInFailed",
  /** A credential exists but its stored expiry has passed. */
  "credentialExpired",
]);
export type ToolAuthFailureReason = typeof ToolAuthFailureReason.Type;
