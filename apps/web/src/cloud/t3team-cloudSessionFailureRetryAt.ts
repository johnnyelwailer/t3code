import type { CloudSessionFailedError } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type * as Cause from "effect/Cause";

const isCloudSessionFailed = (failure: unknown): failure is CloudSessionFailedError =>
  typeof failure === "object" &&
  failure !== null &&
  (failure as { _tag?: unknown })._tag === "CloudSessionFailedError";

/**
 * The earliest wall-clock ms a rate-limited cloud-session call can succeed,
 * when the server named one. Null when the failure carries no pause window.
 */
export function cloudSessionFailureRetryAt(result: {
  readonly cause: Cause.Cause<unknown>;
}): number | null {
  const failure = squashAtomCommandFailure(result);
  if (!isCloudSessionFailed(failure) || typeof failure.retryAt !== "number") {
    return null;
  }
  return Number.isFinite(failure.retryAt) ? failure.retryAt : null;
}
