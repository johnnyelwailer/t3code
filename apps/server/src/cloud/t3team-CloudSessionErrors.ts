import { CloudSessionFailedError } from "@t3tools/contracts";

import type * as GitHubApi from "../sourceControl/GitHubApi.ts";

/**
 * The error boundary between GitHub's API and the cloud session surface: every
 * failure the service hits is mapped here onto a reason the client can act on.
 */

/** Bound what a provider error can contribute to a user-visible message. */
const ERROR_DETAIL_LIMIT = 300;

/**
 * `GitHubApi` already separates "no credential at all" and "the credential was
 * refused" from a plain request failure, which is exactly the distinction the
 * surface needs: the first two mean *set something up*, the third means *this
 * request failed*. A transport failure is the one case the provider was never
 * reached, which the client shows differently from a refusal.
 */
export function toCloudSessionFailure(error: GitHubApi.GitHubApiError): CloudSessionFailedError {
  switch (error._tag) {
    case "GitHubCliMissingError":
      return new CloudSessionFailedError({
        reason: "not_configured",
        message:
          "No GitHub credential on this server, so cloud sessions cannot be started. Set GH_TOKEN, or install the GitHub CLI and run `gh auth login`.",
      });
    case "GitHubNotSignedInError":
    case "GitHubHostDisabledError":
    case "GitHubCliFailedError":
    case "GitHubApiAuthenticationError":
      return new CloudSessionFailedError({
        reason: "unauthorized",
        message: "This server has no usable GitHub credential for the cloud session host.",
      });
    case "GitHubApiRateLimitError":
    case "SourceControlRateLimitPausedError":
      return new CloudSessionFailedError({
        reason: "rejected",
        message: "The provider is rate limiting cloud session requests. Try again shortly.",
      });
    case "GitHubApiRequestError":
      return new CloudSessionFailedError({
        reason: "unreachable",
        message: "The cloud session host could not be reached.",
      });
    default:
      return new CloudSessionFailedError({
        reason: "rejected",
        message: String(error.message ?? "The provider refused the request.").slice(
          0,
          ERROR_DETAIL_LIMIT,
        ),
      });
  }
}
