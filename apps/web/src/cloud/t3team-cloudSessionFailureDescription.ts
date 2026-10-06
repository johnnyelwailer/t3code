import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";

/**
 * The description line for a failed cloud-session command's toast.
 *
 * The server's `CloudSessionFailedError.message` is already user-facing copy
 * (e.g. "The GitHub CLI is not signed in to the cloud session host."), so it
 * is surfaced verbatim. Transport-level failures (disconnected environment,
 * missing auth scope) carry their own user-facing `message` as well. Interrupts
 * and defects (an Effect `Cause.die` — a relay drop, a schema/decode failure)
 * are not user-readable and fall back to a generic line rather than leaking
 * wire internals (protocol method names, schema paths, token-bearing URLs).
 */
export function cloudSessionFailureDescription(result: {
  readonly cause: Cause.Cause<unknown>;
}): string {
  if (Cause.hasInterruptsOnly(result.cause)) return "Unknown error.";
  if (Cause.hasDies(result.cause)) return "Unknown error.";
  const error = squashAtomCommandFailure(result);
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Unknown error.";
}
