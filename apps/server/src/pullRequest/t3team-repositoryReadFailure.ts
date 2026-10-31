import * as Effect from "effect/Effect";
import type { PullRequestProviderError } from "@t3tools/source-control-core/server/PullRequestProvider";

/**
 * What a listing tells the reader about a repository its host would not read: the host's own
 * reason (rate limit, dropped connection, refused query), since "could not be read" alone sends
 * them to the wrong place, plus the host's access hint when it has one.
 */
export function repositoryReadFailureMessage(
  repository: string,
  error: PullRequestProviderError,
): string {
  const reason = error.detail.trim();
  const message =
    reason.length === 0
      ? `${repository} could not be read.`
      : `${repository} could not be read: ${reason}`;
  return error.accessHint === undefined ? message : `${message} ${error.accessHint}`;
}

/** The server-side record of the same failure, with the host and the underlying cause. */
export function logRepositoryReadFailure(
  input: { readonly repository: string; readonly host: string },
  error: PullRequestProviderError,
): Effect.Effect<void> {
  return Effect.logWarning("pull request repository could not be read", {
    repository: input.repository,
    host: input.host,
    provider: error.provider,
    operation: error.operation,
    reason: error.reason,
    detail: error.detail,
    cause: error.cause,
  });
}
