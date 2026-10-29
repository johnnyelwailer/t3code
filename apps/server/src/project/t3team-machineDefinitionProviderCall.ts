/**
 * One provider call under the host's rate limit, failing with a `RemoteUnavailable` whose reason
 * is a fixed sentence: a provider's own error detail can name URLs, so it never reaches a result.
 *
 * @module t3team-machineDefinitionProviderCall
 */
import type { PullRequestProviderError } from "@t3tools/source-control-core/server/PullRequestProvider";
import * as SourceControlRateLimit from "@t3tools/source-control-core/server/SourceControlRateLimit";
import * as Effect from "effect/Effect";

import { RemoteUnavailable } from "./t3team-machineDefinitionReader.ts";
import type { RemoteMachineTarget } from "./t3team-remoteMachineScan.ts";

const REASONS: Record<PullRequestProviderError["reason"], string> = {
  "rate-limited": "Remote discovery is paused by the provider's rate limit.",
  unauthenticated: "You are not signed in to this repository's host.",
  "not-found": "The repository was not found, or your sign-in cannot read it.",
  "missing-tool": "The host's command-line tool is not installed.",
  failed: "The host's request failed.",
};

export const providerCall = Effect.fn("machineSearch.providerCall")(function* <A, R>(
  target: Pick<RemoteMachineTarget, "kind" | "host">,
  call: Effect.Effect<A, PullRequestProviderError, R>,
) {
  const limits = yield* SourceControlRateLimit.SourceControlRateLimit;
  const key = { provider: target.kind, host: target.host };
  const lease = yield* limits
    .check(key)
    .pipe(Effect.mapError(() => new RemoteUnavailable({ reason: REASONS["rate-limited"] })));
  return yield* call.pipe(
    Effect.tap(() => limits.recordSuccess({ ...key, lease })),
    Effect.tapError((error) =>
      error.reason === "rate-limited"
        ? limits.recordRateLimit({ ...key, lease, retryAt: error.retryAt })
        : Effect.void,
    ),
    Effect.mapError((error) => new RemoteUnavailable({ reason: REASONS[error.reason] })),
  );
});
